import { t } from './i18n.js';

export const $ = id => document.getElementById(id);

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let toastTimer;
export function toast(msg, ms = 6000) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function busy(btn, on, label = null) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label ?? t('summary.generating'); btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}

export function errMsg(e) {
  if (e instanceof TypeError) return t('err.ollama');
  return e.message || String(e);
}

// Minimal safe markdown: bold, italics, code, lists, headings. Input is escaped first.
export function md(text) {
  const lines = esc(text).split('\n');
  let html = '', list = null;
  const inline = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const ul = raw.match(/^\s*[-*•]\s+(.*)/);
    const ol = raw.match(/^\s*\d+[.)]\s+(.*)/);
    const h = raw.match(/^#{1,4}\s+(.*)/);
    if (ul || ol) {
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) { close(); html += `<${kind}>`; list = kind; }
      html += `<li>${inline((ul || ol)[1])}</li>`;
    } else if (h) { close(); html += `<h3>${inline(h[1])}</h3>`; }
    else if (raw.trim() === '') { close(); }
    else { close(); html += `<p>${inline(raw)}</p>`; }
  }
  close();
  return html;
}

export function debounce(fn, ms) {
  let h;
  return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
}

export function fmtDate(ts) {
  try { return new Intl.DateTimeFormat(document.documentElement.lang || 'en', { dateStyle: 'medium' }).format(new Date(ts)); }
  catch { return new Date(ts).toLocaleDateString(); }
}
