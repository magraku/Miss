// PDF reading (pdf.js v4, ESM), sectioning, doc-language detection, TF-IDF retrieval.
import { t } from './i18n.js';

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
let pdfjs = null;

export async function extractPdf(file, onProgress = () => {}) {
  try { pdfjs ??= await import(PDFJS_URL); }
  catch { throw new Error(t('err.offlineFirst')); }
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const text = content.items.map(i => i.str + (i.hasEOL ? '\n' : '')).join(' ');
    pages.push(text.replace(/\s+/g, ' ').trim());
    onProgress(p, pdf.numPages);
  }
  if (pages.join('').length < 50) {
    throw new Error(langErr());
  }
  return pages;
}
const langErr = () => lang() === 'fr'
  ? 'Ce PDF semble scanné (pas de texte sélectionnable). Essaie un autre PDF ou colle le texte.'
  : 'This PDF looks scanned (no selectable text). Try another PDF or paste the text.';
import { lang } from './i18n.js';

// Groups text into ~3500-char sections without cutting sentences when possible.
export function chunkPages(pages, max = 3500) {
  const chunks = [];
  let cur = { text: '', pStart: null, pEnd: null };
  pages.forEach((txt, pi) => {
    const sentences = txt.split(/(?<=[.!?:;])\s+/).flatMap(s => {
      const parts = [];
      for (let i = 0; i < s.length; i += max) parts.push(s.slice(i, i + max));
      return parts;
    });
    for (const s of sentences) {
      if (cur.text && cur.text.length + s.length > max) {
        chunks.push(cur);
        cur = { text: '', pStart: null, pEnd: null };
      }
      if (cur.pStart === null) cur.pStart = pi + 1;
      cur.pEnd = pi + 1;
      cur.text += (cur.text ? ' ' : '') + s;
    }
  });
  if (cur.text) chunks.push(cur);
  return chunks;
}

export function chunkPlain(text) {
  return chunkPages([text.replace(/\s+/g, ' ').trim()]).map(c => ({ text: c.text, pStart: null, pEnd: null }));
}

// Stopwords: English + French (the two supported doc languages).
const STOP = new Set((
  'the of and to in is are was were for on with as by at an be this that from or it its ' +
  'not have has had do does did will would can could should may might must shall a i you he she we they ' +
  'his her their our your my me him us them what which who whom when where why how all each every both few more most other some such no nor only own same so than too very s t just don now ' +
  'le la les de des du un une et est en dans que qui pour pas sur au aux avec ce cet cette ces son sa ses ' +
  'il elle nous vous ils elles on ne se sa plus par mais ou donc or ni car comme tout tous toute toutes ' +
  'être avoir faire leur leurs même autres autre peu très bien où quand si non oui mon ton mes tes ses nos vos ' +
  'à ça dont entre sous après avant pendant contre vers chez sans deux trois aussi encore alors là voici voilà ' +
  'quel quelle quels quelles chaque autrui nul certain maint'
).split(/\s+/));

export const tokens = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9']+/).filter(w => w.length > 2 && !STOP.has(w));

// Detect document language from stopword density: 'fr' | 'en' | null
export function detectLang(text) {
  const words = text.toLowerCase().split(/[^a-zàâäéèêëîïôöùûüÿçœæ']+/i).filter(Boolean).slice(0, 4000);
  const FR = new Set('le la les des de du un une et est en dans que qui pour pas sur au avec ce cette il elle nous vous ils sont sont ont fait plus par mais ou'.split(' '));
  const EN = new Set('the of and to in is are was for on with as by at an be this that it from or'.split(' '));
  let fr = 0, en = 0;
  for (const w of words) { if (FR.has(w)) fr++; if (EN.has(w)) en++; }
  if (fr + en < 10) return null;
  return fr > en ? 'fr' : 'en';
}

// TF-IDF-ish scoring: k most relevant chunks for a query.
export function retrieve(chunks, query, k = 3) {
  const q = [...new Set(tokens(query))];
  if (!q.length || !chunks.length) return chunks.slice(0, k).map((c, i) => ({ index: i, chunk: c }));
  const docs = chunks.map(c => tokens(c.text));
  const df = {};
  for (const d of docs) for (const w of new Set(d)) df[w] = (df[w] || 0) + 1;
  const N = chunks.length;
  const scored = docs.map((d, i) => {
    const tf = {};
    for (const w of d) tf[w] = (tf[w] || 0) + 1;
    let s = 0;
    for (const w of q) if (tf[w]) s += (1 + Math.log(tf[w])) * Math.log(1 + N / (1 + (df[w] || 0)));
    return { index: i, chunk: chunks[i], score: s };
  });
  const top = scored.sort((a, b) => b.score - a.score).slice(0, k).filter(x => x.score > 0);
  return top.length ? top : chunks.slice(0, k).map((c, i) => ({ index: i, chunk: c }));
}
