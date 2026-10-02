// public-apis catalog (1966 free APIs, 51 categories) — vendored at data/apis.json.
// Two uses: enrich generated lessons when the document's subject matches an API
// domain, and answer "ask" questions about available APIs.
import { tokens } from './docs.js';

let cache = null;
export async function apis() {
  if (!cache) cache = await (await fetch('./data/apis.json')).json();
  return cache;
}

// Score each API by keyword overlap with the given token multiset.
function score(list, qTokens, limit) {
  const q = new Set(qTokens);
  if (!q.size) return [];
  return list
    .map(a => {
      const words = tokens(`${a.name} ${a.desc} ${a.category}`);
      let s = 0;
      for (const w of words) if (q.has(w)) s += w.length > 5 ? 2 : 1; // distinctive words count more
      return { ...a, _s: s };
    })
    .filter(a => a._s >= 3) // require real overlap, not one common word
    .sort((a, b) => b._s - a._s)
    .slice(0, limit);
}

// Top APIs matching a whole document (used at course creation).
export async function matchApis(chunks, limit = 8) {
  const sample = chunks.slice(0, 4).map(c => c.text).join(' ').slice(0, 12000);
  return score(await apis(), tokens(sample), limit);
}

// Search API by free-text query (ask tab).
export async function searchApis(query, limit = 5) {
  return score(await apis(), tokens(query), limit);
}

export function formatApisForContext(list) {
  return list.map(a => `- ${a.name} (${a.category}): ${a.desc} — ${a.url} [auth:${a.auth || 'unknown'}, https:${a.https}, cors:${a.cors}]`).join('\n');
}
