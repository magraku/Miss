// Lectura de PDFs, división en secciones y búsqueda de fragmentos relevantes (RAG sencillo).
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export async function extractPdf(file, onProgress = () => {}) {
  if (!window.pdfjsLib) throw new Error('No se pudo cargar pdf.js. ¿Tienes conexión a internet?');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const text = content.items.map(i => i.str + (i.hasEOL ? '\n' : '')).join(' ');
    pages.push(text.replace(/\s+/g, ' ').trim());
    onProgress(p, pdf.numPages);
  }
  if (pages.join('').length < 50) {
    throw new Error('Este PDF parece escaneado (no tiene texto seleccionable). Prueba con otro PDF o pega el texto.');
  }
  return pages;
}

// Agrupa el texto en secciones de ~3500 caracteres sin cortar oraciones (si es posible).
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

const STOP = new Set('de la que el en y a los del se las por un para con no una su al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros es son fue ser the of and to in is'.split(' '));
const tokens = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .split(/[^a-z0-9ñ]+/).filter(w => w.length > 2 && !STOP.has(w));

// Puntuación tipo TF-IDF: devuelve los k fragmentos más parecidos a la pregunta.
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
