// File: E:\amazon-business-home\buyers-page\js\utils.js
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c =>
    n.appendChild(c instanceof Node ? c : document.createTextNode(String(c)))
  );
  return n;
}

// Normalize category-like objects/strings to a printable label
export function _catLabel(item) {
  if (item == null) return "";
  // Primitives
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
    return String(item).trim();
  }
  // Objects: prefer typical label keys
  if (typeof item === "object") {
    const keys = [
      "name", "label", "title", "category", "value",
      "MainCategory", "mainCategory", "Category", "slug"
    ];
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(item, key) && item[key] != null) {
        const val = String(item[key]).trim();
        if (val) return val;
      }
    }
    // Fallback: use object's string repr if meaningful
    const s = String(item);
    return s === "[object Object]" ? "" : s.trim();
  }
  return String(item).trim();
}
