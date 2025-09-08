#!/usr/bin/env node
/**
 * Image Processor (standalone, no app changes)
 * - Resizes images to EXACT 600x600.
 * - One-time bulk scan:   node image-processor.cjs --scan
 * - Continuous watcher:   node image-processor.cjs --watch
 * - Do both:              node image-processor.cjs --scan --watch
 *
 * Requires: npm i sharp chokidar fast-glob
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const chokidar = require("chokidar");
const fg = require("fast-glob");

// -------------------- CONFIG: EDIT THESE PATHS ONLY --------------------
/**
 * List all folders where your product images are (originals).
 * Add/remove paths as needed. Relative paths are from this file’s folder.
 * Examples below cover common locations—pick the actual ones you use.
 */
const INPUT_DIRS = [
  path.resolve(__dirname, "../public/images/products_raw"),
  path.resolve(__dirname, "../public/images/products"),
  path.resolve(__dirname, "../uploads/products"),
  path.resolve(__dirname, "../uploads"),
  // path.resolve("D:/some/other/folder"), // you can add external folders too
];

/**
 * How to output the processed images:
 * - "sibling": save next to original, using "-600.jpg" suffix.
 * - "fixed":   mirror folder tree under OUTPUT_FIXED_DIR.
 */
const OUTPUT_MODE = "sibling"; // "sibling" | "fixed"
const OUTPUT_FIXED_DIR = path.resolve(__dirname, "../public/images/products_600");

// Resize behavior:
const FILL_MODE = "contain"; // "contain" = pad to square; "cover" = crop center to square
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 }; // white pad when using "contain"
const QUALITY = 90; // jpeg quality

// File types to process
const IMAGE_REGEX = /\.(jpe?g|png|webp|avif|gif)$/i;

// Concurrency control
const MAX_PARALLEL = 4;

// Suffix & skip rules
const SUFFIX = "-600"; // result name: <base>-600.jpg
// ----------------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const DO_SCAN = args.has("--scan");
const DO_WATCH = args.has("--watch") || args.size === 0; // default to watch if no args

function log(...m) {
  console.log("[images600]", new Date().toISOString(), "-", ...m);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function outPathFor(inputFile) {
  const dir = path.dirname(inputFile);
  const base = path.parse(inputFile).name;
  if (OUTPUT_MODE === "sibling") {
    return path.join(dir, `${base}${SUFFIX}.jpg`);
  } else {
    // fixed output dir, mirror structure under it
    const rel = getFirstMatchingInputRelPath(inputFile);
    const out = path.join(OUTPUT_FIXED_DIR, rel);
    const outDir = path.dirname(out);
    ensureDir(outDir);
    const outBase = path.parse(out).name;
    return path.join(outDir, `${outBase}${SUFFIX}.jpg`);
  }
}

function getFirstMatchingInputRelPath(file) {
  for (const root of INPUT_DIRS) {
    if (file.startsWith(root)) {
      return path.relative(root, file);
    }
  }
  // fallback: just filename
  return path.basename(file);
}

function shouldIgnore(file) {
  // Ignore non-images, already-processed, node_modules, dotfiles
  if (!IMAGE_REGEX.test(file)) return true;
  if (file.toLowerCase().includes(`${SUFFIX}.jpg`)) return true;
  if (file.includes("node_modules")) return true;
  if (path.basename(file).startsWith(".")) return true;
  return false;
}

async function processOne(file) {
  try {
    const output = outPathFor(file);
    if (fs.existsSync(output)) {
      // quick skip if we already have processed file
      return { file, output, skipped: true, reason: "exists" };
    }

    // Confirm readable
    await fs.promises.access(file, fs.constants.R_OK);

    // Sharp pipeline
    let pipeline = sharp(file).rotate().resize(600, 600, {
      fit: FILL_MODE,
      background: BACKGROUND,
    });

    await pipeline.jpeg({ quality: QUALITY, chromaSubsampling: "4:4:4" }).toFile(output);
    return { file, output, ok: true };
  } catch (err) {
    return { file, error: err.message };
  }
}

async function limitConcurrency(items, limit, worker) {
  const results = [];
  let idx = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function scanAll() {
  // Collect files from all INPUT_DIRS
  const patterns = INPUT_DIRS
    .filter((p) => fs.existsSync(p))
    .map((dir) => path.join(dir, "**/*"));
  if (patterns.length === 0) {
    log("No INPUT_DIRS exist. Edit INPUT_DIRS in config.");
    return;
  }
  const files = (await fg(patterns, { onlyFiles: true, dot: false }))
    .filter((f) => !shouldIgnore(f));

  log(`Scan found ${files.length} candidate image(s).`);
  if (OUTPUT_MODE === "fixed") ensureDir(OUTPUT_FIXED_DIR);

  const results = await limitConcurrency(files, MAX_PARALLEL, processOne);
  const ok = results.filter((r) => r?.ok).length;
  const skipped = results.filter((r) => r?.skipped).length;
  const errors = results.filter((r) => r?.error);
  log(`Scan complete. OK: ${ok}, Skipped: ${skipped}, Errors: ${errors.length}`);
  if (errors.length) {
    errors.slice(0, 20).forEach((e) => log("ERR:", e.file, e.error));
    if (errors.length > 20) log(`...and ${errors.length - 20} more errors`);
  }
}

function startWatcher() {
  const roots = INPUT_DIRS.filter((p) => fs.existsSync(p));
  if (roots.length === 0) {
    log("No INPUT_DIRS exist. Edit INPUT_DIRS in config.");
    return;
  }
  if (OUTPUT_MODE === "fixed") ensureDir(OUTPUT_FIXED_DIR);

  log("Watching for new images in:");
  roots.forEach((r) => log(" -", r));

  const watcher = chokidar.watch(roots, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 750, pollInterval: 100 },
    depth: 20,
  });

  const onFile = async (file) => {
    if (shouldIgnore(file)) return;
    const res = await processOne(file);
    if (res?.ok) log("OK:", path.basename(file), "→", path.relative(process.cwd(), res.output));
    else if (res?.skipped) log("SKIP:", path.basename(file), `(${res.reason})`);
    else if (res?.error) log("ERR:", path.basename(file), res.error);
  };

  watcher.on("add", onFile).on("change", onFile).on("error", (e) => log("watcher error:", e.message));
}

// Entrypoint
(async () => {
  try {
    // Ensure at least one input dir exists, but don't exit—user can edit later.
    INPUT_DIRS.forEach((d) => { if (!fs.existsSync(d)) log("Note: missing folder (edit INPUT_DIRS):", d); });

    if (DO_SCAN) await scanAll();
    if (DO_WATCH) startWatcher();

    if (!DO_SCAN && !DO_WATCH) {
      log("Nothing to do. Use --scan and/or --watch.");
    }
  } catch (e) {
    log("Fatal:", e.message);
    process.exit(1);
  }
})();
