// MissPedia — main controller. Views: home / library / study (Data Deck).
import { state, save, bus, notifyDoc, persistDoc, hydrateDoc, upsertLibrary, removeCourse, addXP, markSectionDone } from './store.js';
import { connect, chatStream, engineState, onEngineChange, probeCapabilities, whenEngineReady } from './llm.js';
import { extractPdf, chunkPages, chunkPlain, detectLang } from './docs.js';
import { $, esc, md, toast, busy, errMsg, fmtDate } from './util.js';
import { t, setLang, applyI18n, lang } from './i18n.js';
import { sys, FIRST_LESSON_REQUEST, API_APPENDIX, docLang, EVAL_REQUEST, EVAL_SCHEMA, HINT_REQUEST } from './instructional.js';
import { chatJSON } from './llm.js';
import { matchApis, formatApisForContext } from './apilib.js';
import { initAuth, signIn, signOut, auth, authEnabled, deleteRemote } from './sync.js';
import { CONFIG } from './config.js';
import { initStudy, genCards, genQuiz } from './study.js';
import { initTimer } from './timer.js';
import { getCourse } from './db.js';

let caps = { canGenerate: false, mobile: false }; // filled by probeCapabilities() in boot
let relatedApis = []; // APIs matched to the active document

/* ── Stats ── */
function renderStats() {
  const s = $('streak'), x = $('xp');
  if (s) s.textContent = state.streak === 1 ? t('study.day') : t('study.days', { n: state.streak });
  if (x) x.textContent = t('study.xp', { n: state.xp });
}
bus.addEventListener('stats', renderStats);

/* ── Views ── */
const VIEWS = ['home', 'library', 'study'];
function showView(name) {
  VIEWS.forEach(v => { $(`view-${v}`).hidden = v !== name; });
  const tt = $('topTabs');
  if (tt) tt.hidden = name !== 'study';
  if (name === 'library') renderLibrary();
  if (name === 'study') { renderDoc(); renderStats(); }
}

/* ── Tabs ── */
const tabs = [...document.querySelectorAll('[role=tab]')];
function showTab(name) {
  tabs.forEach(tb => {
    const on = tb.dataset.tab === name;
    tb.setAttribute('aria-selected', String(on));
    tb.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll('.panel').forEach(p => { p.hidden = p.id !== `panel-${name}`; });
  $('panel-summary').hidden = name !== 'summary';
  document.querySelector('.workspace').hidden = name === 'summary';
}
tabs.forEach(tb => { tb.onclick = () => showTab(tb.dataset.tab); });

/* ── Engine status ── */
function updateEngineUI() {
  const bar = $('engineBar'), fill = $('engineFill'), msg = $('engineMsg'), retry = $('engineRetry');
  const rb = $('readyBtn');
  const ready = engineState.status === 'ready';
  rb.disabled = !(ready && state.doc);

  if (engineState.status === 'downloading' || engineState.status === 'loading') {
    bar.hidden = false;
    fill.style.width = `${Math.round(engineState.progress * 100)}%`;
    msg.textContent = engineState.message;
    retry.hidden = true;
  } else if (ready) {
    bar.hidden = true;
    msg.textContent = t('home.modelReady', { model: engineState.model });
    retry.hidden = true;
  } else {
    bar.hidden = true;
    msg.textContent = engineState.message ||
      (caps.canGenerate ? '' : t('home.noWebgpu'));
    retry.hidden = engineState.status !== 'error';
  }
  // Mirror download progress into the generation overlay when it's open.
  const go = $('genOverlay');
  if (go && !go.hidden && (engineState.status === 'downloading' || engineState.status === 'loading'))
    setGenProgress(engineState.progress, engineState.message);
  renderDoc(); // next-section lock depends on whether the AI can evaluate answers
}
onEngineChange(updateEngineUI);

$('engineRetry').onclick = () => { engineState.status = 'idle'; void connect(); };

/* ── Top bar: lang / donate / auth / library ── */
document.querySelectorAll('.topbar .lang-toggle button').forEach(b => {
  b.onclick = () => {
    setLang(b.dataset.lang);
    // Courses are generated in the document's own language — switching the UI
    // language later does not translate an existing course.
    if (state.doc) toast(t('lang.courseNote'));
  };
});
$('navDonate').href = CONFIG.DONATE_URL || '#';
$('navDonate').onclick = e => { if (!CONFIG.DONATE_URL) { e.preventDefault(); toast(t('nav.donateToast')); } };
$('brandHome').onclick = e => { e.preventDefault(); showView('home'); };
$('navLibrary').onclick = () => showView('library');

function renderAuth() {
  const btn = $('navAuth');
  btn.textContent = auth.user ? (auth.user.email?.split('@')[0] || 'account') : t('nav.signin');
  const syncEl = $('syncState');
  if (syncEl) syncEl.textContent = auth.user ? t('lib.synced') : t('lib.local');
}
bus.addEventListener('auth', renderAuth);
bus.addEventListener('lang', renderAuth);
bus.addEventListener('lang', renderStats);

$('navAuth').onclick = () => {
  const dlg = $('authDlg');
  if (auth.user) {
    $('authForm').hidden = true;
    $('authSigned').hidden = false;
    $('authUserEmail').textContent = auth.user.email;
    $('authSyncNote').textContent = t('lib.synced');
  } else {
    if (!authEnabled()) { toast('Sync is not configured yet (missing Supabase keys).'); return; }
    $('authForm').hidden = false;
    $('authSigned').hidden = true;
    $('authMsg').textContent = '';
  }
  dlg.showModal();
};

$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('authEmail').value.trim();
  const btn = $('authSend');
  busy(btn, true, '…');
  try {
    await signIn(email);
    $('authMsg').textContent = t('auth.sent');
  } catch (err) {
    $('authMsg').textContent = t('auth.error', { msg: err.message });
  } finally { busy(btn, false); }
});
$('authSignOut').onclick = async () => { await signOut(); $('authDlg').close(); };

/* ── Library ── */
function renderLibrary() {
  const grid = $('libGrid');
  const banner = $('libBanner');
  if (!caps.canGenerate) { banner.hidden = false; banner.textContent = t('lib.mobileBanner'); }
  else if (!auth.user && authEnabled()) { banner.hidden = false; banner.textContent = t('lib.signinCta'); }
  else banner.hidden = true;

  if (!state.library.length) {
    grid.innerHTML = `<p class="empty-msg">${t('lib.empty')}</p>`;
    return;
  }
  grid.innerHTML = state.library
    .slice().sort((a, b) => b.updatedAt - a.updatedAt)
    .map(c => `
      <article class="lib-card" data-id="${esc(c.id)}">
        <h3>${esc(c.name)}</h3>
        <p>${t('lib.progress', { done: c.done, total: c.total })}</p>
        <p class="hint-sm">${t('lib.updated', { d: fmtDate(c.updatedAt) })}</p>
        <div class="lib-actions">
          <button class="pill-btn" data-open="${esc(c.id)}">${t('lib.open')}</button>
          <button class="ghost-link" data-del="${esc(c.id)}">${t('lib.delete')}</button>
        </div>
      </article>`).join('');
  grid.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => openCourse(b.dataset.open); });
  grid.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = async () => {
      if (!confirm(t('lib.confirmDelete'))) return;
      await removeCourse(b.dataset.del);
      await deleteRemote(b.dataset.del).catch(() => {});
      renderLibrary();
    };
  });
}
bus.addEventListener('lib', renderLibrary);

async function openCourse(id) {
  const p = await getCourse(id);
  if (!p || !p.chunks?.length) { toast(p ? t('lib.bodyMissing') : t('lib.empty')); return; }
  state.doc = {
    id, name: p.name, lang: p.lang || 'en',
    chunks: p.chunks, summaries: p.summaries || {}, questions: p.questions || {}, quizzes: p.quizzes || {},
    current: p.current ?? 0, done: p.done || [],
    apis: p.apis || [],
  };
  relatedApis = state.doc.apis || [];
  notifyDoc();
  showView('study');
  showTab('summary');
  renderSummary();
}

/* ── Drop ring / file input / paste ── */
const dropRing = $('dropRing');
const dropLabel = $('dropLabel');
const dropHint = $('dropHint');

dropRing.addEventListener('dragover', e => { e.preventDefault(); dropRing.classList.add('drag-over'); });
dropRing.addEventListener('dragleave', () => dropRing.classList.remove('drag-over'));
dropRing.addEventListener('drop', async e => {
  e.preventDefault();
  dropRing.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) await handleFile(file);
});

$('file').onchange = async e => {
  const file = e.target.files[0];
  if (file) await handleFile(file);
};

async function handleFile(file) {
  dropLabel.textContent = t('home.reading');
  dropHint.textContent = file.name;
  $('docStatus').textContent = '';
  try {
    // Only pdf/txt/md — the accept attribute is a hint, not a validation.
    // text/* would also let .csv/.html through (B12).
    const okType = /\.(pdf|txt|md|markdown)$/i.test(file.name) ||
      file.type === 'application/pdf' || file.type === 'text/plain' || file.type === 'text/markdown';
    if (!okType) throw new Error(t('home.badType'));
    let chunks;
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const pages = await extractPdf(file, (p, n) => { dropLabel.textContent = t('home.page', { p, n }); });
      chunks = chunkPages(pages);
    } else {
      chunks = chunkPlain(await file.text());
    }
    // Same minimum as pasted text: refuse empty / unusable documents.
    if (!chunks.length || chunks.map(c => c.text).join('').trim().length < 50)
      throw new Error(t('home.docTooShort'));
    await loadDoc(file.name, chunks);
    dropRing.classList.add('has-file');
    dropLabel.textContent = file.name.length > 28 ? file.name.slice(0, 25) + '…' : file.name;
    dropHint.textContent = t('home.sections', { n: chunks.length });
    updateReadyBtn();
  } catch (err) {
    // Rejection keeps the previously loaded doc active — say so explicitly
    // instead of showing an empty ring while "ready!" opens it.
    dropRing.classList.toggle('has-file', !!state.doc);
    dropLabel.textContent = state.doc ? state.doc.name : t('home.drop');
    dropHint.textContent = state.doc ? t('home.stillLoaded') : t('home.dropHint');
    updateReadyBtn();
    toast(errMsg(err));
  }
}

$('togglePaste').onclick = () => { $('pasteBox').hidden = !$('pasteBox').hidden; };

$('usePaste').onclick = async () => {
  const text = $('paste').value.trim();
  if (text.length < 50) return toast(t('home.pasteTooShort'));
  const chunks = chunkPlain(text);
  await loadDoc('Pasted notes', chunks);
  dropLabel.textContent = t('home.textLoaded');
  dropHint.textContent = t('home.sections', { n: chunks.length });
  dropRing.classList.add('has-file');
  $('pasteBox').hidden = true;
  updateReadyBtn();
};

function updateReadyBtn() {
  $('readyBtn').disabled = !(state.doc && engineState.status === 'ready');
}

/* ── Document lifecycle ── */
const chunk = () => state.doc && state.doc.chunks?.[state.doc.current];

async function loadDoc(name, chunks) {
  const text = chunks.map(c => c.text).join(' ');
  const dLang = detectLang(text) || 'en';
  state.doc = {
    id: crypto.randomUUID(), name, lang: dLang,
    chunks, current: 0, done: [], summaries: {}, questions: {}, quizzes: {},
  };
  await persistDoc();
  upsertLibrary({ id: state.doc.id, name, lang: dLang, updatedAt: Date.now(), total: chunks.length, done: 0 });
  // Match free public APIs to the document subject (context for lessons).
  relatedApis = [];
  matchApis(chunks).then(list => {
    relatedApis = list;
    state.doc.apis = list;
    if (list.length) toast(t('home.apiMatches', { n: list.length }));
    void persistDoc();
  }).catch(() => {});
  notifyDoc();
}

function renderDoc() {
  const d = state.doc;
  const n = d?.chunks?.length || 0; // localStorage keeps the doc meta but not chunks (hydrateDoc fills them later)
  const label = i => {
    const c = d.chunks[i];
    return c.pStart ? (c.pStart === c.pEnd ? t('doc.pages', { p: c.pStart }) : t('doc.pagesRange', { a: c.pStart, b: c.pEnd })) : '';
  };
  const sl = $('sectionLabel');
  if (sl) sl.textContent = d && n ? `${d.current + 1} / ${n}${label(d.current) ? ' · ' + label(d.current) : ''}` : t('doc.none');
  const prev = $('prevSec'), next = $('nextSec'), nextL = $('nextLesson');
  if (d) {
    prev.disabled = d.current === 0;
    // One question, one gate: the next section only unlocks once the AI has
    // judged the learner's answer "mastered" (or a challenge was passed).
    // Without a running engine (mobile review) navigation stays free.
    const canEvaluate = engineState.status === 'ready';
    const unlocked = !canEvaluate || (d.done || []).includes(d.current);
    next.disabled = nextL.disabled = !n || d.current >= n - 1 || !unlocked;
    nextL.textContent = unlocked ? t('doc.nextLesson') : t('doc.locked');
    nextL.classList.toggle('locked', !unlocked);
  }
  const dn = $('docName');
  if (dn) dn.textContent = d ? d.name : '';
  if (d) renderSummary(); // always refresh — clears a stale lesson when the doc has no content
}

async function goTo(i) {
  if (!state.doc?.chunks?.length) return;
  state.doc.current = Math.max(0, Math.min(state.doc.chunks.length - 1, i));
  notifyDoc();
  await persistDoc();
  void maybeGenerateForSection();
}
$('prevSec').onclick = () => goTo(state.doc.current - 1);
$('nextSec').onclick = () => goTo(state.doc.current + 1);
$('nextLesson').onclick = () => goTo(state.doc.current + 1);
bus.addEventListener('doc', renderDoc);
bus.addEventListener('lang', renderDoc); // keep the lock label in the right language

/* ── Lesson (summary) ── */
function renderSummary() {
  const s = state.doc && state.doc.summaries?.[state.doc.current];
  const out = $('summaryOut');
  if (out) out.innerHTML = s ? md(s) : `<p class="empty-msg">${t('summary.empty')}</p>`;
}

const learner = () => state.settings.name
  ? `\n\n${docLang(state.doc) === 'fr' ? "Le prénom de l'apprenant·e est" : "The learner's first name is"} ${state.settings.name}.`
  : '';

const genSummaryBtn = $('genSummary');
async function genSummary({ automatic = false, onProgress } = {}) {
  const ch = chunk();
  if (!ch) return toast(t('summary.needDoc'));
  const out = $('summaryOut');
  const idx = state.doc.current;
  const d = state.doc;
  busy(genSummaryBtn, true, t('summary.generating'));
  const apiBlock = relatedApis.length ? API_APPENDIX[docLang(d)] + formatApisForContext(relatedApis) : '';
  let acc = '';
  try {
    for await (const t_ of chatStream([
      { role: 'system', content: sys(d) },
      { role: 'user', content: `${FIRST_LESSON_REQUEST[docLang(d)]}${learner()}\n\n${docLang(d) === 'fr' ? 'MATÉRIAU DE LA SECTION' : 'SECTION MATERIAL'}:\n${ch.text}${apiBlock}` },
    ])) { acc += t_; out.innerHTML = md(acc); onProgress?.(Math.min(1, acc.length / 4000)); }
    if (!acc.trim()) throw new Error(t('err.notJson'));
    state.doc.summaries[idx] = acc;
    // The check question is extracted once and frozen: retries, feedback and
    // hints always refer to THIS question — it never changes.
    d.questions = d.questions || {};
    d.questions[idx] = extractQuestion(acc) || t('eval.defaultQ');
    save(); await persistDoc();
    renderEvalBox();
    return acc;
  } catch (e) { toast(errMsg(e)); } finally { busy(genSummaryBtn, false); }
}
if (genSummaryBtn) genSummaryBtn.onclick = () => { void genSummary(); };

/* ── Evaluator (Maria's loop: no progress without comprehension) ── */
// Pull the single check question out of the generated lesson. The prompt
// requires it under a "Question" heading; fall back to the last '?'-line.
function extractQuestion(lesson) {
  const m = lesson.match(/^#{1,4}[^\n]*\bquestions?\b[^\n]*$/im);
  if (m) {
    const block = lesson.slice(m.index + m[0].length).trim().split(/\n\s*\n|^#{1,4}/m)[0].trim();
    if (block) return block;
  }
  const marks = lesson.match(/[^\n?][^\n]*\?[^\n]*/g);
  return marks ? marks[marks.length - 1].trim() : '';
}

let evalFor = null; // "docId:section" the eval box currently belongs to
function renderEvalBox() {
  const box = $('evalBox');
  if (!box) return;
  const d = state.doc;
  const key = d ? `${d.id}:${d.current}` : null;
  const hasLesson = !!(d && d.summaries?.[d.current]);
  box.hidden = !(hasLesson && engineState.status === 'ready');
  // Backfill for lessons generated before questions were stored separately.
  let q = d?.questions?.[d.current];
  if (!q && hasLesson) {
    q = extractQuestion(d.summaries[d.current]) || t('eval.defaultQ');
    d.questions = d.questions || {};
    d.questions[d.current] = q;
    void persistDoc();
  }
  const qEl = $('evalQuestion');
  if (qEl) qEl.innerHTML = q ? md(q) : '';
  if (key !== evalFor) { // only reset the conversation when the section changes
    evalFor = key;
    $('evalFeedback').innerHTML = '';
    $('evalHint').innerHTML = '';
    $('evalInput').value = '';
  }
}
bus.addEventListener('doc', renderEvalBox);
onEngineChange(renderEvalBox);

async function evaluateAnswer() {
  const d = state.doc;
  const answer = $('evalInput').value.trim();
  const ch = chunk();
  if (!ch) return toast(t('summary.needDoc'));
  if (!answer) return;
  const btn = $('evalBtn'); busy(btn, true, t('eval.thinking'));
  try {
    const r = await chatJSON([
      { role: 'system', content: sys(d) },
      { role: 'user', content: `${EVAL_REQUEST[docLang(d)]}${learner()}\n\nLESSON MATERIAL:\n${ch.text}\n\nLESSON:\n${d.summaries?.[d.current] || ''}\n\nLEARNER ANSWER:\n${answer}` },
    ], EVAL_SCHEMA);
    const fb = $('evalFeedback');
    const cls = r.verdict === 'mastered' ? 'eval-good' : r.verdict === 'partial' ? 'eval-mid' : 'eval-bad';
    fb.innerHTML = `<div class="eval-msg ${cls}">${md(r.feedback)}</div>`;
    if (r.verdict !== 'mastered') {
      // The question never changes — the learner simply tries it again.
      fb.innerHTML += `<p class="eval-follow">${t('eval.retry')}</p>`;
    }
    if (r.verdict === 'mastered') {
      addXP(8);
      fb.innerHTML += `<p class="eval-mastered">${t('eval.mastered')}</p>`;
      $('evalInput').value = '';
      if (markSectionDone()) void persistDoc();
    }
  } catch (e) { toast(errMsg(e)); } finally { busy(btn, false); }
}
$('evalBtn').onclick = evaluateAnswer;
$('evalInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); void evaluateAnswer(); } });

// Hint: rephrase or nudge on the SAME question — never a new one.
$('evalHintBtn').onclick = async () => {
  const d = state.doc, ch = chunk(), q = d?.questions?.[d.current];
  if (!ch) return toast(t('summary.needDoc'));
  if (!d || !q) return;
  const btn = $('evalHintBtn'); busy(btn, true, t('eval.thinking'));
  const p = document.createElement('p');
  p.className = 'eval-hint-item';
  $('evalHint').appendChild(p);
  let acc = '';
  try {
    for await (const tok of chatStream([
      { role: 'system', content: sys(d) },
      { role: 'user', content: `${HINT_REQUEST[docLang(d)]}\n\nQUESTION: ${q}\n\nLESSON MATERIAL:\n${ch.text}` },
    ])) { acc += tok; p.innerHTML = md(acc); }
  } catch (e) { p.remove(); toast(errMsg(e)); } finally { busy(btn, false); }
};

// Auto-generate lesson when entering a section that has none.
async function maybeGenerateForSection() {
  if (!state.doc || state.doc.summaries?.[state.doc.current]) return;
  if (engineState.status !== 'ready') return;
  await genSummary({ automatic: true });
}

/* ── Ready → study ── */
const genOverlay = $('genOverlay'), genHint = $('genHint'), genBack = $('genBack'),
      genBar = $('genBar'), genFill = $('genFill');
function setGenProgress(frac, label) {
  if (!genBar) return;
  genBar.hidden = false;
  genFill.style.width = `${Math.round(Math.min(1, Math.max(0, frac)) * 100)}%`;
  if (label) genHint.textContent = label;
}
function showGenOverlay(on, errMsg_) {
  genOverlay.hidden = !on;
  genBack.hidden = !errMsg_;
  if (on) { genFill.style.width = '0%'; genBar.hidden = false; }
  if (errMsg_) genHint.textContent = errMsg_;
  else genHint.textContent = t('gen.hint');
}
genBack.onclick = () => { showGenOverlay(false); showView('home'); };

$('readyBtn').onclick = () => {
  if (!state.doc) return;
  showView('study');
  showTab('summary');
  renderDoc();
  renderStats();
  void launchLearningExperience();
};

let learningLaunch = 0;
async function launchLearningExperience() {
  const launch = ++learningLaunch;
  showGenOverlay(true);
  try {
    // Gate on the engine: the course must not appear before AI is up.
    if (engineState.status !== 'ready') {
      void connect(); // start/resume if idle
      await whenEngineReady();
    }
    const names = [t('gen.stepLesson'), t('gen.stepCards'), t('gen.stepQuiz')];
    const marks = ['…', '…', '…'];
    const total = names.length;
    let done = 0, sub = 0; // sub = streaming fraction of the running lesson step
    const label = () => `${t('gen.step', { done, total })} — ${names.map((n, i) => `${n}${marks[i]}`).join(' · ')}`;
    const paint = () => setGenProgress((done + Math.min(sub, 0.97)) / total, label());
    const finish = (i, ok) => { marks[i] = ok ? '✓' : '✗'; done++; if (i === 0) sub = 0; paint(); };
    const track = (p, i) => Promise.resolve(p).then(v => { finish(i, true); return v; }, e => { finish(i, false); throw e; });
    paint();
    const results = await Promise.allSettled([
      track(genSummary({ automatic: true, onProgress: f => { sub = f; paint(); } }), 0),
      track(genCards({ automatic: true }), 1),
      track(genQuiz({ automatic: true }), 2),
    ]);
    if (launch !== learningLaunch) return;
    showGenOverlay(false);
    // Generators toast their own errors and resolve with a falsy value —
    // count real output, not just settled promises.
    const ok = results.filter(r => r.status === 'fulfilled' && r.value).length;
    if (ok === total) toast(t('toast.ready'));
    else if (ok) toast(t('toast.partial', { n: ok, total }));
    else toast(t('err.ollama'));
  } catch (e) {
    if (launch !== learningLaunch) return;
    showGenOverlay(true, errMsg(e));
  }
}

$('backBtn').onclick = () => showView('library');

/* ── Focus panel toggle ── */
$('focusToggle').onclick = () => { $('focusBody').hidden = !$('focusBody').hidden; };

/* ── Onboarding: first name + language, asked once ── */
let obLang = null;
function renderGreeting() {
  const el = $('homeTagline');
  if (!el) return;
  const name = state.settings.name;
  el.textContent = name ? t('app.taglineName', { name }) : t('app.tagline');
}
bus.addEventListener('lang', renderGreeting);

function initOnboarding() {
  document.querySelectorAll('#onboardDlg [data-ol]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.ol === (obLang || lang())));
    b.onclick = () => {
      obLang = b.dataset.ol;
      document.querySelectorAll('#onboardDlg [data-ol]').forEach(x =>
        x.setAttribute('aria-pressed', String(x === b)));
    };
  });
  $('onboardForm').addEventListener('submit', () => {
    const name = $('onbName').value.trim();
    if (name) state.settings.name = name;
    if (obLang) setLang(obLang);
    state.settings.onboarded = true;
    save();
    renderGreeting();
  });
}

/* ── Boot ── */
async function boot() {
  try {
    applyI18n();
    renderGreeting();
    renderStats();
    renderAuth();
    initStudy();
    initTimer();
    initOnboarding();
    updateEngineUI();
  } catch (e) { console.warn('boot ui failed', e); }
  // Probe the engine FIRST — a failure in storage/auth/onboarding must never
  // leave the "device can't run the AI" message up.
  caps = await probeCapabilities().catch(() => caps);
  void connect();
  try { await hydrateDoc(); } catch (e) { console.warn('hydrate failed', e); }
  renderDoc();
  showView(state.doc ? 'study' : 'home');
  await initAuth().catch(e => console.warn('auth init failed', e));
  if (!state.settings.onboarded) $('onboardDlg').showModal();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}
void boot();
