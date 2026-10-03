// App state: metadata + progress in localStorage; document bodies in IndexedDB
// (see db.js). Synced to Supabase when signed in (see sync.js).
import { putCourse, getCourse, deleteCourse } from './db.js';

const KEY = 'misspedia:v1';
const LEGACY_KEY = 'sosiego:v1';
const defaults = {
  xp: 0, streak: 0, lastDay: null,
  cards: [], sessions: [],
  settings: { model: '', focusMin: 30, lang: 'en', name: '' },
  library: [],   // [{id, name, lang, updatedAt, total, done}] course metadata
  doc: null,     // active course: { id, name, lang, current, done:[], summaries:{}, chunks:[] }
};

function load() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);
    const s = raw ? { ...structuredClone(defaults), ...JSON.parse(raw) } : structuredClone(defaults);
    if (!Array.isArray(s.library)) s.library = [];
    return s;
  } catch { return structuredClone(defaults); }
}

export const state = load();
export const bus = new EventTarget(); // events: 'stats', 'doc', 'lib', 'auth'

export function save() {
  try {
    // chunks stay out of localStorage — IndexedDB only.
    const { doc, ...rest } = state;
    const docMeta = doc ? { ...doc, chunks: undefined } : null;
    localStorage.setItem(KEY, JSON.stringify({ ...rest, doc: docMeta }));
  } catch (e) { console.warn('Could not save progress', e); }
}

export async function persistDoc() {
  // Never write a meta-only doc over the stored body — chunks hydrate async
  // and a chunk-less write would wipe the course.
  if (!state.doc || !state.doc.chunks?.length) return;
  await putCourse(state.doc.id, {
    name: state.doc.name, lang: state.doc.lang,
    chunks: state.doc.chunks, summaries: state.doc.summaries,
    questions: state.doc.questions || {},
    current: state.doc.current, done: state.doc.done,
    apis: state.doc.apis || [],
  });
}

export async function hydrateDoc() {
  if (!state.doc || !state.doc.id) return;
  if (Array.isArray(state.doc.chunks) && state.doc.chunks.length) return;
  const p = await getCourse(state.doc.id);
  if (p) Object.assign(state.doc, { chunks: p.chunks || [], summaries: p.summaries || {}, questions: p.questions || {}, current: p.current ?? 0, done: p.done || [] });
}

export function upsertLibrary(meta) {
  const i = state.library.findIndex(c => c.id === meta.id);
  if (i >= 0) state.library[i] = meta; else state.library.push(meta);
  save();
  bus.dispatchEvent(new Event('lib'));
}

export async function removeCourse(id) {
  state.library = state.library.filter(c => c.id !== id);
  if (state.doc?.id === id) state.doc = null;
  state.cards = state.cards.filter(c => c.docId !== id);
  await deleteCourse(id).catch(() => {});
  save();
  bus.dispatchEvent(new Event('lib'));
  bus.dispatchEvent(new Event('doc'));
}

const day = (d = new Date()) => d.toISOString().slice(0, 10);

function touchStreak() {
  const today = day();
  if (state.lastDay === today) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  state.streak = state.lastDay === day(y) ? state.streak + 1 : 1;
  state.lastDay = today;
}

export function addXP(n) {
  state.xp += n;
  touchStreak();
  save();
  bus.dispatchEvent(new Event('stats'));
}

export function notifyDoc() {
  save();
  bus.dispatchEvent(new Event('doc'));
}

export function todaySessions() {
  return state.sessions.filter(s => s.day === day());
}
export { day };
