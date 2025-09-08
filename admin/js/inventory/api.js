// admin/js/inventory/api.js
import { apiFetch, qs } from './helpers.js';

// Parse JSON safely and surface useful errors
async function asJSON(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse JSON (${res.status} ${res.statusText}): ${e.message}\n${text.slice(0, 500)}`);
  }
}

export const API = {
  // List products with filters/paging
  async list(query = {}) {
    const r = await apiFetch(`/products${qs(query)}`);
    return asJSON(r);
  },

  // Soft delete with automatic POST /delete fallback
  async remove(idOrSku) {
    try {
      const r = await apiFetch(`/products/${encodeURIComponent(idOrSku)}`, { method: 'DELETE' });
      return asJSON(r);
    } catch {
      const r2 = await apiFetch(`/products/${encodeURIComponent(idOrSku)}/delete`, { method: 'POST' });
      return asJSON(r2);
    }
  },

  // Restore a soft-deleted product
  async restore(idOrSku) {
    const r = await apiFetch(`/products/${encodeURIComponent(idOrSku)}/restore`, { method: 'POST' });
    return asJSON(r);
  },

  // Main categories for filters
  async categories() {
    try {
      const r = await apiFetch(`/categories?type=main`);
      return asJSON(r);
    } catch {
      return [];
    }
  },

  // ----- optional helpers (handy for editor screens) -----

  // Fetch a single product (by id or sku)
  async getOne(idOrSku) {
    const r = await apiFetch(`/products/${encodeURIComponent(idOrSku)}`);
    return asJSON(r);
  },

  // Health check (useful in debugging)
  async health() {
    try {
      const r = await apiFetch(`/health`);
      return asJSON(r);
    } catch {
      return { ok: false };
    }
  }
};
