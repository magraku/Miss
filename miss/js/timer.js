// Temporizador de concentración: bloque + pausa, con reflexión al terminar.
import { state, save, addXP, todaySessions, day } from './store.js';
import { $ } from './util.js';

const C = 2 * Math.PI * 54; // circunferencia del anillo
let phase = 'focus';        // 'focus' | 'break'
let running = false, endAt = 0, remaining = 0, total = 0, timer = null;

function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function render() {
  $('time').textContent = fmt(remaining);
  $('arc').style.strokeDashoffset = String(C * (1 - (total ? remaining / total : 1)));
  $('phase').textContent = phase === 'focus' ? 'concentración' : 'descanso';
  document.body.dataset.phase = running ? phase : 'idle';
  $('start').textContent = running ? 'pausar' : (remaining < total ? 'continuar' : 'comenzar');
  $('cycles').textContent = `bloques hoy: ${todaySessions().length}`;
  document.title = running ? `${fmt(remaining)} · Sosiego` : 'Sosiego · estudia con calma';
}

function setDuration(min) { total = remaining = min * 60000; render(); }

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.35 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.35); o.stop(ctx.currentTime + i * 0.35 + 0.7);
    });
  } catch { /* sin audio */ }
}

function start() {
  if (running) return;
  if (phase === 'focus' && remaining === total && !$('intention').value.trim()) {
    $('intention').focus();
    $('intention').placeholder = 'Escribe qué vas a lograr antes de empezar';
    return;
  }
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  running = true;
  endAt = Date.now() + remaining;
  timer = setInterval(tick, 250);
  render();
}

function pause() {
  running = false;
  clearInterval(timer);
  remaining = Math.max(0, endAt - Date.now());
  render();
}

function tick() {
  remaining = Math.max(0, endAt - Date.now());
  render();
  if (remaining <= 0) finish();
}

function finish() {
  clearInterval(timer);
  running = false;
  beep();
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(phase === 'focus' ? 'Bloque terminado' : 'Fin del descanso');
  }
  if (phase === 'focus') {
    const session = { day: day(), minutes: total / 60000, intention: $('intention').value.trim(), result: null };
    state.sessions.push(session);
    $('reflectQ').textContent = `¿Lograste esto? “${session.intention}”`;
    $('reflect').returnValue = '';
    $('reflect').showModal();
    $('reflect').addEventListener('close', () => {
      session.result = $('reflect').returnValue || 'partly';
      save();
      addXP(session.result === 'yes' ? 25 : 10);
      phase = 'break';
      setDuration(state.sessions.filter(s => s.day === day()).length % 4 === 0 ? 15 : 5);
      start();
    }, { once: true });
  } else {
    phase = 'focus';
    setDuration(Number($('focusMin').value));
  }
  render();
}

$('start').onclick = () => (running ? pause() : start());
$('reset').onclick = () => {
  clearInterval(timer); running = false; phase = 'focus';
  setDuration(Number($('focusMin').value));
};
$('focusMin').onchange = () => {
  state.settings.focusMin = Number($('focusMin').value); save();
  if (!running && phase === 'focus') setDuration(state.settings.focusMin);
};

$('focusMin').value = String(state.settings.focusMin);
setDuration(state.settings.focusMin);
