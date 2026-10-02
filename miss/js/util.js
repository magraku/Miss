export const $ = id => document.getElementById(id);

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let toastTimer;
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 6000);
}

export function busy(btn, on, label = 'Generando…') {
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}

export function errMsg(e) {
  if (e instanceof TypeError) return 'No puedo conectar con Ollama. Comprueba que esté abierto (ollama serve).';
  return e.message || String(e);
}

// Markdown mínimo y seguro: negritas, cursivas, código, listas y títulos.
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
