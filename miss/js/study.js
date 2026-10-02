// Tarjetas de repaso (cajas de Leitner) y quiz generados por Gemma.
import { state, save, addXP, bus, notifyDoc } from './store.js';
import { chatJSON } from './llm.js';
import { $, esc, toast, busy, errMsg } from './util.js';
import { INSTRUCTIONAL_SYSTEM } from './instructional.js';

const SYSTEM = `${INSTRUCTIONAL_SYSTEM}\nResponde siempre en español, con lenguaje claro. Usa únicamente el texto que se te da; no inventes datos.`;
const DAY = 86400000;
const INTERVALS = [0, 1, 3, 7, 14, 30]; // días por caja

const chunk = () => state.doc && state.doc.chunks[state.doc.current];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- Tarjetas ---------- */
const CARD_SCHEMA = {
  type: 'object',
  properties: { cards: { type: 'array', items: { type: 'object', properties: { front: { type: 'string' }, back: { type: 'string' } }, required: ['front', 'back'] } } },
  required: ['cards'],
};
let queue = [];

function buildQueue() {
  queue = shuffle(state.cards.filter(c => c.due <= Date.now()));
  renderCard();
}

function renderCard() {
  const stage = $('cardStage');
  $('cardCount').textContent = `${state.cards.length} tarjetas en total · ${queue.length} pendientes ahora`;
  if (!state.cards.length) { stage.innerHTML = '<p class="empty">Aún no tienes tarjetas. Crea las de la sección actual.</p>'; return; }
  if (!queue.length) { stage.innerHTML = '<p class="empty">No quedan tarjetas por repasar ahora. Vuelve más tarde: las verás justo antes de olvidarlas.</p>'; return; }
  const c = queue[0];
  stage.innerHTML = `
    <div class="card">
      <div class="side">Pregunta</div>
      <div>${esc(c.front)}</div>
      <div id="ans" hidden class="answer"><div class="side">Respuesta</div>${esc(c.back)}</div>
    </div>
    <div class="rate">
      <button id="reveal" class="primary">Ver respuesta</button>
      <button data-r="again" hidden>Otra vez</button>
      <button data-r="good" hidden>Bien</button>
      <button data-r="easy" hidden>Fácil</button>
    </div>`;
  $('reveal').onclick = () => {
    $('ans').hidden = false; $('reveal').hidden = true;
    stage.querySelectorAll('[data-r]').forEach(b => { b.hidden = false; });
    stage.querySelector('[data-r=good]').focus();
  };
  stage.querySelectorAll('[data-r]').forEach(b => { b.onclick = () => rate(b.dataset.r); });
}

function rate(r) {
  const c = queue.shift();
  if (r === 'again') { c.box = 0; c.due = Date.now(); queue.push(c); }
  else {
    c.box = Math.min(5, c.box + (r === 'easy' ? 2 : 1));
    c.due = Date.now() + INTERVALS[c.box] * DAY;
    addXP(r === 'easy' ? 3 : 2);
  }
  save();
  renderCard();
}

export async function genCards({ automatic = false } = {}) {
  const ch = chunk();
  if (!ch) return toast('Primero sube tu material en la pantalla de inicio.');
  const btn = $('genCards'); busy(btn, true);
  try {
    const data = await chatJSON([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Crea entre 5 y 8 tarjetas de estudio con el texto siguiente. Cada tarjeta tiene "front" (una pregunta que obligue a recordar o explicar, no de sí/no) y "back" (respuesta breve y precisa).\n\nTEXTO:\n${ch.text}` },
    ], CARD_SCHEMA);
    const now = Date.now();
    const fresh = (data.cards || []).filter(c => c.front && c.back)
      .map(c => ({ id: crypto.randomUUID(), front: c.front, back: c.back, box: 0, due: now, doc: state.doc.name, section: state.doc.current }));
    if (!fresh.length) throw new Error('Gemma no generó tarjetas útiles. Inténtalo de nuevo.');
    state.cards.push(...fresh); save();
    buildQueue();
    if (!automatic) toast(`${fresh.length} tarjetas nuevas`);
    return fresh.length;
  } catch (e) { toast(errMsg(e)); } finally { busy(btn, false); }
}

/* ---------- Quiz ---------- */
const QUIZ_SCHEMA = {
  type: 'object',
  properties: { questions: { type: 'array', items: { type: 'object', properties: {
    question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } },
    answer: { type: 'integer' }, explanation: { type: 'string' } },
    required: ['question', 'options', 'answer', 'explanation'] } } },
  required: ['questions'],
};
let quiz = null;

function renderQuiz() {
  const stage = $('quizStage');
  if (!quiz) return;
  if (quiz.i >= quiz.qs.length) {
    const pct = Math.round((quiz.score / quiz.qs.length) * 100);
    const passed = pct >= 60;
    if (passed && !state.doc.done.includes(state.doc.current)) {
      state.doc.done.push(state.doc.current); addXP(10); notifyDoc();
    }
    stage.innerHTML = `<h3>${quiz.score} de ${quiz.qs.length} correctas</h3>
      <p>${passed ? 'Sección dominada por ahora. Pasa a la siguiente cuando quieras.' : 'Aún se te escapan algunas ideas. Repasa el resumen y vuelve a intentarlo.'}</p>`;
    return;
  }
  const q = quiz.qs[quiz.i];
  stage.innerHTML = `
    <div class="progressbar"><span style="width:${(quiz.i / quiz.qs.length) * 100}%"></span></div>
    <h3>${esc(q.question)}</h3>
    <div class="options">${q.options.map((o, i) => `<button data-i="${i}">${esc(o)}</button>`).join('')}</div>
    <div id="fb"></div>`;
  stage.querySelectorAll('.options button').forEach(b => {
    b.onclick = () => {
      const pick = Number(b.dataset.i), ok = pick === q.answer;
      stage.querySelectorAll('.options button').forEach((x, i) => {
        x.disabled = true;
        if (i === q.answer) x.classList.add('right');
        else if (i === pick) x.classList.add('wrong');
      });
      if (ok) { quiz.score++; addXP(5); }
      $('fb').innerHTML = `<div class="feedback"><strong>${ok ? 'Correcto.' : 'No exactamente.'}</strong> ${esc(q.explanation || '')}</div><button id="nextQ" class="primary">${quiz.i + 1 < quiz.qs.length ? 'Siguiente pregunta' : 'Ver resultado'}</button>`;
      $('nextQ').onclick = () => { quiz.i++; renderQuiz(); };
      $('nextQ').focus();
    };
  });
}

export async function genQuiz({ automatic = false } = {}) {
  const ch = chunk();
  if (!ch) return toast('Primero sube tu material en la pantalla de inicio.');
  const btn = $('genQuiz'); busy(btn, true);
  try {
    const data = await chatJSON([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Crea un quiz de 5 preguntas de opción múltiple (4 opciones cada una) sobre el texto. Ordénalas de menor a mayor dificultad: primero reconocer conceptos, al final aplicarlos a una situación nueva. "answer" es el índice (empezando en 0) de la opción correcta y "explanation" explica por qué es correcta en una o dos frases.\n\nTEXTO:\n${ch.text}` },
    ], QUIZ_SCHEMA);
    const qs = (data.questions || []).filter(q => q.question && Array.isArray(q.options) && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length)
      .map(q => {
        const opts = q.options.map((text, i) => ({ text, ok: i === q.answer }));
        shuffle(opts); // los modelos suelen poner la correcta primero
        return { question: q.question, options: opts.map(o => o.text), answer: opts.findIndex(o => o.ok), explanation: q.explanation };
      });
    if (!qs.length) throw new Error('Gemma no generó preguntas válidas. Inténtalo de nuevo.');
    quiz = { qs, i: 0, score: 0 };
    renderQuiz();
    return qs.length;
  } catch (e) { toast(errMsg(e)); } finally { busy(btn, false); }
}

export async function generateLearningTools() {
  const [cards, quizResult] = await Promise.allSettled([
    genCards({ automatic: true }),
    genQuiz({ automatic: true }),
  ]);
  return {
    cards: cards.status === 'fulfilled' ? cards.value : 0,
    quiz: quizResult.status === 'fulfilled' ? quizResult.value : 0,
  };
}

export function initStudy() {
  $('genCards').onclick = genCards;
  $('genQuiz').onclick = genQuiz;
  bus.addEventListener('doc', () => { quiz = null; $('quizStage').innerHTML = '<p class="empty">Genera un quiz para comprobar si entendiste la sección.</p>'; });
  buildQueue();
}
