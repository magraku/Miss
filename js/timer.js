// Focus timer: block + break, reflection at the end.
import { state, save, addXP, todaySessions, day } from './store.js';
import { $ } from './util.js';
import { t, applyI18n } from './i18n.js';
import { bus } from './store.js';

const C = 2 * Math.PI * 54; // ring circumference
let phase = 'focus';        // 'focus' | 'break'
let running = false, endAt = 0, remaining = 0, total = 0, timer = null;

function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function render() {
  const time = $('time'), arc = $('arc'), ph = $('phase'), start = $('start'), cyc = $('cycles');
  if (!time) return; // view not present
  time.textContent = fmt(remaining);
  arc.style.strokeDashoffset = String(C * (1 - (total ? remaining / total : 1)));
  ph.textContent = t(phase === 'focus' ? 'timer.focus' : 'timer.break');
  document.body.dataset.phase = running ? phase : 'idle';
  start.textContent = running ? t('timer.pause') : (remaining < total ? t('timer.resume') : t('timer.start'));
  cyc.textContent = t('timer.blocks', { n: todaySessions().length });
  document.title = running ? `${fmt(remaining)} · MissPedia` : 'MissPedia';
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
  } catch { /* no audio */ }
}

function start() {
  if (running) return;
  const intention = $('intention');
  if (phase === 'focus' && remaining === total && !intention.value.trim()) {
    intention.focus();
    intention.placeholder = t('timer.intentionReq');
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
    new Notification(phase === 'focus' ? t('timer.notifFocus') : t('timer.notifBreak'));
  }
  if (phase === 'focus') {
    const session = { day: day(), minutes: total / 60000, intention: $('intention').value.trim(), result: null };
    state.sessions.push(session);
    $('reflectQ').textContent = t('timer.doneQ', { i: session.intention });
    const dlg = $('reflect');
    dlg.returnValue = '';
    dlg.showModal();
    dlg.addEventListener('close', () => {
      session.result = dlg.returnValue || 'partly';
      save();
      addXP(session.result === 'yes' ? 25 : 10);
      phase = 'break';
      setDuration(todaySessions().length % 4 === 0 ? 15 : 5);
      start();
    }, { once: true });
  } else {
    phase = 'focus';
    setDuration(Number($('focusMin').value));
  }
  render();
}

export function initTimer() {
  const startBtn = $('start'), resetBtn = $('reset'), focusSel = $('focusMin');
  if (!startBtn) return;
  startBtn.onclick = () => (running ? pause() : start());
  resetBtn.onclick = () => {
    clearInterval(timer); running = false; phase = 'focus';
    setDuration(Number(focusSel.value));
  };
  focusSel.onchange = () => {
    state.settings.focusMin = Number(focusSel.value); save();
    if (!running && phase === 'focus') setDuration(state.settings.focusMin);
  };
  focusSel.value = String(state.settings.focusMin);
  bus.addEventListener('lang', render);
  setDuration(state.settings.focusMin);
}
