import { escapeRegex } from './dom.js';

const COLOR_WORDS = [
  'red','white','orange','green','yellow','blue','black',
  'transparent','grey','gray','pink','silver','gold','golden','neon'
];

const ALL_COLOR_REGEXES = COLOR_WORDS.map(w => ({
  name: w, rx: new RegExp(`\\b${escapeRegex(w)}\\b`, 'i')
}));

export function normalizeColorName(c=''){
  const lc = String(c).toLowerCase();
  if (lc === 'gray') return 'grey';
  if (lc === 'golden') return 'gold';
  return lc;
}

export function colorsInTitle(title=''){
  const hits = new Set();
  for (const {name,rx} of ALL_COLOR_REGEXES) if (rx.test(title)) hits.add(name);
  if (hits.has('gray') || hits.has('grey')) { hits.delete('gray'); hits.add('grey'); }
  if (hits.has('golden')) { hits.delete('golden'); hits.add('gold'); }
  return hits;
}
