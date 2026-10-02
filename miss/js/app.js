import { state, save, bus, notifyDoc } from './store.js';
import { listModels, chatStream } from './llm.js';
import { extractPdf, chunkPages, chunkPlain, retrieve } from './docs.js';
import { $, esc, md, toast, busy, errMsg } from './util.js';
import { INSTRUCTIONAL_SYSTEM, FIRST_LESSON_REQUEST } from './instructional.js';
import './timer.js';
import { initStudy, generateLearningTools } from './study.js';

const SYSTEM = `${INSTRUCTIONAL_SYSTEM}\nRespondes siempre en español, con lenguaje claro y ejemplos cotidianos. Usas el texto que se te da; no inventas datos.`;

/* ── Tema ── */
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

/* ── Stats ── */
function renderStats() {
  const s = $('streak'); const x = $('xp');
  if (s) s.textContent = `${state.streak} ${state.streak === 1 ? 'día' : 'días'}`;
  if (x) x.textContent = `${state.xp} XP`;
}
bus.addEventListener('stats', renderStats);

/* ── Vista: home ↔ study ── */
function showView(name) {
  document.getElementById('view-home').hidden  = name !== 'home';
  document.getElementById('view-study').hidden = name !== 'study';
}

/* ── Tabs (study view) ── */
const tabs = [...document.querySelectorAll('[role=tab]')];
function showTab(name) {
  tabs.forEach(t => {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll('.panel').forEach(p => { p.hidden = p.id !== `panel-${name}`; });
}
tabs.forEach(t => { t.onclick = () => showTab(t.dataset.tab); });

/* ── Conexión Ollama ── */
function setStatus(kind) {
  ['status','status2'].forEach(id => {
    const el = $(id);
    if (el) el.className = `dot ${kind}`;
  });
  const rb = $('readyBtn');
  if (rb) rb.disabled = kind !== 'ok' || !state.doc;
}

async function connect() {
  const selIds = ['model', 'model2'];
  try {
    const names = await listModels();
    selIds.forEach(id => {
      const sel = $(id);
      if (sel) sel.innerHTML = names.map(n => `<option>${esc(n)}</option>`).join('');
    });
    if (!names.length) return setStatus('bad');
    const pick = names.includes(state.settings.model)
      ? state.settings.model
      : (names.find(n => n.startsWith('gemma')) || names[0]);
    selIds.forEach(id => { const s = $(id); if (s) s.value = pick; });
    state.settings.model = pick; save();
    setStatus('ok');
  } catch {
    setStatus('bad');
  }
}

['model','model2'].forEach(id => {
  const el = $(id);
  if (el) el.onchange = () => { state.settings.model = el.value; save(); };
});

const reconnBtn = $('reconnect');
if (reconnBtn) reconnBtn.onclick = connect;

/* ── Drop ring: drag & drop ── */
const dropRing = document.getElementById('dropRing');
const dropLabel = document.getElementById('dropLabel');
const dropHint  = document.getElementById('dropHint');

dropRing.addEventListener('dragover', e => { e.preventDefault(); dropRing.classList.add('drag-over'); });
dropRing.addEventListener('dragleave', () => dropRing.classList.remove('drag-over'));
dropRing.addEventListener('drop', async e => {
  e.preventDefault();
  dropRing.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) await handleFile(file);
});

/* ── File input ── */
$('file').onchange = async e => {
  const file = e.target.files[0];
  if (file) await handleFile(file);
};

async function handleFile(file) {
  dropLabel.textContent = 'leyendo…';
  dropHint.textContent  = file.name;
  const docStatus = $('docStatus');
  if (docStatus) docStatus.textContent = '';
  try {
    let chunks;
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const pages = await extractPdf(file, (p, n) => {
        dropLabel.textContent = `pág. ${p} / ${n}`;
      });
      chunks = chunkPages(pages);
    } else {
      chunks = chunkPlain(await file.text());
    }
    await loadDoc(file.name, chunks);
    dropRing.classList.add('has-file');
    dropLabel.textContent = file.name.length > 28 ? file.name.slice(0,25) + '…' : file.name;
    dropHint.textContent  = `${chunks.length} secciones`;
    updateReadyBtn();
  } catch (err) {
    dropLabel.textContent = 'put your files here.';
    dropHint.textContent  = 'pdf · txt · md';
    toast(errMsg(err));
  }
}

/* ── Paste ── */
const togglePaste = $('togglePaste');
const pasteBox    = $('pasteBox');
if (togglePaste) togglePaste.onclick = () => { pasteBox.hidden = !pasteBox.hidden; };

$('usePaste').onclick = async () => {
  const text = $('paste').value.trim();
  if (text.length < 50) return toast('Pega un texto un poco más largo.');
  const chunks = chunkPlain(text);
  await loadDoc('Texto pegado', chunks);
  dropLabel.textContent = 'texto cargado';
  dropHint.textContent  = `${chunks.length} secciones`;
  dropRing.classList.add('has-file');
  pasteBox.hidden = true;
  updateReadyBtn();
};

/* ── Ready button ── */
function updateReadyBtn() {
  const rb = $('readyBtn');
  if (!rb) return;
  // enable only if we have a doc (status is checked separately)
  const dot = $('status');
  const isOk = dot && dot.classList.contains('ok');
  rb.disabled = !state.doc || !isOk;
}

$('readyBtn').onclick = () => {
  showView('study');
  const dn = $('docName');
  if (dn && state.doc) dn.textContent = state.doc.name;
  showTab('summary');
  renderDoc();
  renderStats();
  void launchLearningExperience();
};

let learningLaunch = 0;
async function launchLearningExperience() {
  const launch = ++learningLaunch;
  toast('Preparando tu primera lección, práctica y reto…');
  const results = await Promise.allSettled([
    genSummary({ automatic: true }),
    generateLearningTools(),
  ]);
  if (launch !== learningLaunch) return;
  const completed = results.filter(r => r.status === 'fulfilled').length;
  if (completed) toast('Tu lección, tarjetas y quiz ya están propuestos.');
}

/* ── Back button ── */
$('backBtn').onclick = () => showView('home');

/* ── Documento ── */
const chunk = () => state.doc && state.doc.chunks[state.doc.current];

async function loadDoc(name, chunks) {
  state.doc = { name, chunks, current: 0, done: [], summaries: {} };
  notifyDoc();
}

function renderDoc() {
  const d = state.doc;
  const list = $('sections');
  if (!d || !list) return;
  const label = i => {
    const c = d.chunks[i];
    return c.pStart ? (c.pStart === c.pEnd ? `pág. ${c.pStart}` : `págs. ${c.pStart}–${c.pEnd}`) : '';
  };
  const sl = $('sectionLabel');
  if (sl) sl.textContent = `${d.current + 1} / ${d.chunks.length}${label(d.current) ? ' · ' + label(d.current) : ''}`;
  const prev = $('prev'), next = $('next');
  if (prev) prev.disabled = d.current === 0;
  if (next) next.disabled = d.current >= d.chunks.length - 1;
  list.innerHTML = d.chunks.map((c, i) => `
    <li><button data-i="${i}" ${i === d.current ? 'aria-current="true"' : ''}>
      <span class="num">sección ${i + 1}</span>
      <span>${esc(c.text.slice(0, 60))}…</span>
      ${d.done.includes(i) ? '<span class="done">✓</span>' : ''}
    </button></li>`).join('');
  list.querySelectorAll('button').forEach(b => { b.onclick = () => goTo(Number(b.dataset.i)); });
  renderSummary();
}

function goTo(i) {
  if (!state.doc) return;
  state.doc.current = Math.max(0, Math.min(state.doc.chunks.length - 1, i));
  notifyDoc();
}
const prevBtn = $('prev'), nextBtn = $('next');
if (prevBtn) prevBtn.onclick = () => goTo(state.doc.current - 1);
if (nextBtn) nextBtn.onclick = () => goTo(state.doc.current + 1);
bus.addEventListener('doc', renderDoc);

/* ── Resumen ── */
function renderSummary() {
  const s = state.doc && state.doc.summaries[state.doc.current];
  const out = $('summaryOut');
  if (out) out.innerHTML = s ? md(s) : '<p class="empty-msg">Tu primera lección se preparará automáticamente al pulsar «ready!».</p>';
}

const genSummaryBtn = $('genSummary');
async function genSummary({ automatic = false } = {}) {
  const ch = chunk();
  if (!ch) return toast('Primero carga tu material.');
  const out = $('summaryOut');
  const idx = state.doc.current;
  busy(genSummaryBtn, true, automatic ? 'preparando…' : 'generando…');
  let acc = '';
  try {
    for await (const t of chatStream([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `${FIRST_LESSON_REQUEST}\n\nMATERIAL DE LA SECCIÓN ACTUAL:\n${ch.text}` },
    ])) { acc += t; out.innerHTML = md(acc); }
    state.doc.summaries[idx] = acc; save();
    return acc;
  } catch (e) { toast(errMsg(e)); } finally { busy(genSummaryBtn, false); }
}
if (genSummaryBtn) genSummaryBtn.onclick = () => { void genSummary(); };

/* ── Chat ── */
const history = [];
function bubble(cls, html) {
  const el = document.createElement('div');
  el.className = `msg ${cls}`;
  el.innerHTML = html;
  $('chat').appendChild(el);
  $('chat').scrollTop = $('chat').scrollHeight;
  return el;
}
const askForm = $('askForm');
if (askForm) askForm.onsubmit = async e => {
  e.preventDefault();
  const q = $('askInput').value.trim();
  if (!q) return;
  if (!state.doc) return toast('Primero carga tu material.');
  $('askInput').value = '';
  bubble('user', esc(q));
  const hits = retrieve(state.doc.chunks, q, 3);
  const context = hits.map(h => `[Sección ${h.index + 1}]\n${h.chunk.text}`).join('\n\n');
  const bot = bubble('bot', '…');
  const btn = $('askBtn'); btn.disabled = true;
  let acc = '';
  try {
    for await (const t of chatStream([
      { role: 'system', content: `${SYSTEM} Responde usando el CONTEXTO. Si no contiene la respuesta, dilo claramente.\n\nCONTEXTO:\n${context}` },
      ...history.slice(-6),
      { role: 'user', content: q },
    ])) { acc += t; bot.innerHTML = md(acc); $('chat').scrollTop = $('chat').scrollHeight; }
    bot.innerHTML += `<span class="src">secciones: ${hits.map(h => h.index + 1).join(', ')}</span>`;
    history.push({ role: 'user', content: q }, { role: 'assistant', content: acc });
  } catch (err) { bot.textContent = errMsg(err); } finally { btn.disabled = false; }
};

/* ── Arranque ── */
applyTheme();
renderStats();
renderDoc();
initStudy();
connect();
showView('home');
