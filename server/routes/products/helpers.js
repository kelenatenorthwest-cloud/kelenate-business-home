// server/routes/products/helpers.js
function safeParseJSON(s, fallback) {
  try { const v = JSON.parse(s); return (v ?? fallback); } catch { return fallback; }
}
function toNum(v) {
  const n = parseFloat(v); return Number.isFinite(n) ? n : null;
}
function rowToObj(r) {
  if (!r || typeof r !== 'object') return null;

  // get a stable id: prefer explicit id, else alias we add from SQL ( __rowid )
  const id = (r.id ?? r.__rowid ?? r.rowid ?? null);

  // images/videos (support legacy single image)
  const imagesRaw = r.images ?? (r.image ? JSON.stringify([r.image]) : '[]');
  const imagesArr = safeParseJSON(imagesRaw, []);
  const images = Array.isArray(imagesArr) ? imagesArr.filter(Boolean) : [];

  const videosArr = safeParseJSON(r.videos, []);
  const videos = Array.isArray(videosArr) ? videosArr.filter(Boolean) : [];

  return {
    id,
    title: r.title,
    mrp: r.mrp,
    price: r.price,
    sku: r.sku,
    category: r.category,
    mainCategory: r.category,
    moq: r.moq ?? 1,
    bullets: safeParseJSON(r.bullets, []),
    description: r.description,
    images,
    videos,
    image: images[0] || null,
    status: r.status || 'active',
    is_deleted: r.is_deleted ? 1 : 0,
    deleted_at: r.deleted_at || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// IMPORTANT: if the param looks numeric, treat it as SQLite rowid (works whether or not you have an 'id' column)
function byIdOrSkuParam(id) {
  const s = String(id);
  return /^\d+$/.test(s)
    ? { col: 'rowid', val: Number(s) }
    : { col: 'sku',   val: s };
}

module.exports = { safeParseJSON, toNum, rowToObj, byIdOrSkuParam };
