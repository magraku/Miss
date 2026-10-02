// Estado de la app guardado en localStorage (nada sale de tu navegador).
const KEY = 'sosiego:v1';
const defaults = {
  xp: 0, streak: 0, lastDay: null,
  cards: [], sessions: [],
  settings: { model: '', focusMin: 30, theme: 'auto' },
  doc: null, // { name, chunks:[{text,pStart,pEnd}], current, done:[], summaries:{} }
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...structuredClone(defaults), ...JSON.parse(raw) } : structuredClone(defaults);
  } catch { return structuredClone(defaults); }
}

export const state = load();
export const bus = new EventTarget(); // eventos: 'stats', 'doc'

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.warn('No se pudo guardar el progreso', e); }
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
  const today = day();
  return state.sessions.filter(s => s.day === today);
}
export { day };
