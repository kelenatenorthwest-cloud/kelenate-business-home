// server/routes/adminConfig.js
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const express = require("express");

const router = express.Router();
const DATA_DIR  = path.join(__dirname, "..", "data");
const JSON_PATH = path.join(DATA_DIR, "filters-config.json");

const DEFAULT_CONFIG = {
  unavailable_mode: "lock", // "lock" | "hide"
  colors: [
    { name: "Multi" },
    { name: "Red", dot: "#ef4444" }, { name: "White", dot: "#e5e7eb" },
    { name: "Orange", dot: "#f97316" }, { name: "Green", dot: "#22c55e" },
    { name: "Yellow", dot: "#eab308" }, { name: "Blue", dot: "#3b82f6" },
    { name: "Black", dot: "#111827" }, { name: "Transparent", dot: "transparent" },
    { name: "Grey", dot: "#9ca3af" }, { name: "Pink", dot: "#ec4899" },
    { name: "Silver", dot: "#c0c0c0" }, { name: "Gold", dot: "#d4af37" },
    { name: "Neon", dot: "#39ff14" }
  ],
  price_bands: [
    { id: "u500",  label: "Under ₹500",      min: 0,    max: 500 },
    { id: "5-10",  label: "₹500 – ₹1,000",   min: 500,  max: 1000 },
    { id: "10-15", label: "₹1,000 – ₹1,500", min: 1000, max: 1500 },
    { id: "15-30", label: "₹1,500 – ₹3,000", min: 1500, max: 3000 },
    { id: "o3k",   label: "Over ₹3,000",     min: 3000, max: null }
  ],
  discounts: [
    { id: "d10", label: "10% Off or more", min: 10 },
    { id: "d25", label: "25% Off or more", min: 25 },
    { id: "d35", label: "35% Off or more", min: 35 },
    { id: "d50", label: "50% Off or more", min: 50 },
    { id: "d60", label: "60% Off or more", min: 60 },
    { id: "d70", label: "70% Off or more", min: 70 }
  ]
};

async function ensureFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(JSON_PATH, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(JSON_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
  }
}

function validateConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return "Config must be an object";
  if (!["lock", "hide"].includes(cfg.unavailable_mode || "lock")) {
    return "unavailable_mode must be 'lock' or 'hide'";
  }
  if (!Array.isArray(cfg.colors)) return "colors must be an array";
  if (!Array.isArray(cfg.price_bands)) return "price_bands must be an array";
  if (!Array.isArray(cfg.discounts)) return "discounts must be an array";

  // light type checks (kept soft to avoid breaking existing data)
  for (const d of cfg.discounts) {
    const m = Number(d?.min);
    if (!Number.isFinite(m) || m < 0) return "discounts[].min must be a non-negative number";
  }
  for (const b of cfg.price_bands) {
    const min = Number(b?.min ?? 0);
    const max = b?.max == null ? null : Number(b.max);
    if (!Number.isFinite(min)) return "price_bands[].min must be a number";
    if (!(max === null || Number.isFinite(max))) return "price_bands[].max must be a number or null";
    if (max !== null && min > max) return "price_bands[].min cannot be greater than max";
  }
  return null;
}

// --- Normalize to keep the file clean and resilient
function normalize(cfg) {
  const out = {
    unavailable_mode: ["lock", "hide"].includes(cfg.unavailable_mode) ? cfg.unavailable_mode : "lock",
    colors: Array.isArray(cfg.colors)
      ? cfg.colors
          .filter(Boolean)
          .map(c => ({
            name: String(c.name || "").trim(),
            ...(c.dot ? { dot: String(c.dot).trim() } : {})
          }))
          .filter(c => c.name)
      : [],
    price_bands: Array.isArray(cfg.price_bands)
      ? cfg.price_bands
          .filter(Boolean)
          .map(b => {
            const min = Number(b.min ?? 0);
            const max = b.max == null ? null : Number(b.max);
            let label = String(b.label || "").trim();
            const clean = {
              id: b.id || undefined,
              min: Number.isFinite(min) ? min : 0,
              max: max === null ? null : (Number.isFinite(max) ? max : null),
              label
            };
            if (!clean.label) {
              clean.label =
                clean.max === null
                  ? `Over ₹${clean.min}`
                  : clean.min === 0
                  ? `Under ₹${clean.max}`
                  : `₹${clean.min} – ₹${clean.max}`;
            }
            return clean;
          })
      : [],
    discounts: Array.isArray(cfg.discounts)
      ? cfg.discounts
          .filter(Boolean)
          .map(d => {
            const min = Number(d.min ?? 0);
            const clean = {
              id: d.id || undefined,
              min: Number.isFinite(min) ? min : 0,
              label: String(d.label || "").trim()
            };
            if (!clean.label) clean.label = `${clean.min}% Off or more`;
            return clean;
          })
      : []
  };
  return out;
}

// --- Safe read with fallback if JSON is corrupted
async function readConfig() {
  await ensureFile();
  try {
    const raw = await fsp.readFile(JSON_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return normalize(parsed);
  } catch {
    // write defaults if file is unreadable/corrupt
    await fsp.writeFile(JSON_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

router.get("/", async (_req, res) => {
  const data = await readConfig();
  res.set("Cache-Control", "no-store");
  res.json(data);
});

router.put("/", express.json(), async (req, res) => {
  await ensureFile();
  const err = validateConfig(req.body);
  if (err) return res.status(400).json({ error: err });

  // Normalize input before persisting and write atomically
  const data = normalize(req.body);
  const tmp = JSON_PATH + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fsp.rename(tmp, JSON_PATH);

  res.set("Cache-Control", "no-store");
  res.json({ ok: true });
});

module.exports = router;
