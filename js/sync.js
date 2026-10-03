// Supabase auth (magic link) + course sync. Everything is optional: with no
// keys configured the app works fully offline on the current device.
import { CONFIG } from './config.js';
import { state, save, bus, upsertLibrary } from './store.js';
import { putCourse, getCourse, deleteCourse } from './db.js';
import { debounce } from './util.js';

let sb = null;
export const auth = { user: null, ready: false };

export function authEnabled() { return !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY); }

export async function initAuth() {
  if (!authEnabled()) { auth.ready = true; bus.dispatchEvent(new Event('auth')); return; }
  const { createClient } = await import('https://esm.run/@supabase/supabase-js@2');
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  const { data } = await sb.auth.getSession();
  auth.user = data.session?.user ?? null;
  auth.ready = true;
  bus.dispatchEvent(new Event('auth'));
  sb.auth.onAuthStateChange((_e, session) => {
    auth.user = session?.user ?? null;
    bus.dispatchEvent(new Event('auth'));
    if (auth.user) void pullAll();
  });
  if (auth.user) await pullAll();
}

export async function signIn(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

export async function signOut() { await sb?.auth.signOut(); }

/* ── Sync ──
   Table `courses`: doc_key (client id) + payload (whole course). Last write
   wins; push is debounced on every doc change. */

const pushDebounced = debounce(() => { void pushActive(); }, 1500);
bus.addEventListener('doc', () => { if (auth.user) pushDebounced(); });

async function pushActive() {
  const d = state.doc;
  if (!sb || !auth.user || !d || !d.chunks?.length) return; // never push a chunk-less doc
  await sb.from('courses').upsert({
    user_id: auth.user.id,
    doc_key: d.id,
    name: d.name,
    lang: d.lang || 'en',
    payload: {
      chunks: d.chunks, summaries: d.summaries, questions: d.questions || {},
      quizzes: d.quizzes || {},
      current: d.current, done: d.done, apis: d.apis || [],
      cards: state.cards.filter(c => c.docId === d.id),
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,doc_key' });
}

export async function pullAll() {
  if (!sb || !auth.user) return;
  const { data, error } = await sb.from('courses')
    .select('doc_key,name,lang,payload,updated_at')
    .order('updated_at', { ascending: false });
  if (error) { console.warn('pull failed', error); return; }
  for (const row of data || []) {
    const p = row.payload || {};
    upsertLibrary({
      id: row.doc_key, name: row.name, lang: row.lang,
      updatedAt: new Date(row.updated_at).getTime(),
      total: (p.chunks || []).length, done: (p.done || []).length,
    });
    await putCourse(row.doc_key, { name: row.name, lang: row.lang, ...p }); // cache body locally
    // If the active course lost its local body (e.g. corrupted write), heal it
    // from the remote payload we just pulled.
    if (state.doc?.id === row.doc_key && !state.doc.chunks?.length && p.chunks?.length) {
      Object.assign(state.doc, {
        chunks: p.chunks, summaries: p.summaries || {}, questions: p.questions || {},
        quizzes: p.quizzes || {},
        current: p.current ?? 0, done: p.done || [],
      });
      bus.dispatchEvent(new Event('doc'));
    }
    if (p.cards?.length) {
      const known = new Set(state.cards.map(c => c.id));
      state.cards.push(...p.cards.filter(c => !known.has(c.id)));
      save();
    }
  }
}

export async function deleteRemote(docKey) {
  if (!sb || !auth.user) return;
  await sb.from('courses').delete().eq('doc_key', docKey);
}
