// Cliente mínimo de Ollama (http://localhost:11434) para usar Gemma en local.
import { state } from './store.js';

const BASE = 'http://localhost:11434';
const OPTIONS = { num_ctx: 8192 }; // Ollama usa 2048-4096 por defecto: se queda corto para textos de estudio

function model() {
  if (!state.settings.model) throw new Error('Elige un modelo arriba. Para instalar Gemma: ollama pull gemma3:4b');
  return state.settings.model;
}

async function fail(r) {
  let t = await r.text();
  try { t = JSON.parse(t).error || t; } catch { /* texto plano */ }
  throw new Error(t);
}

export async function listModels() {
  const r = await fetch(`${BASE}/api/tags`);
  if (!r.ok) await fail(r);
  const d = await r.json();
  return (d.models || []).map(m => m.name);
}

export async function* chatStream(messages, signal) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model(), messages, stream: true, options: { ...OPTIONS, temperature: 0.4 } }),
  });
  if (!r.ok) await fail(r);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const j = JSON.parse(line);
      if (j.error) throw new Error(j.error);
      if (j.message?.content) yield j.message.content;
    }
  }
}

// Respuesta estructurada: Ollama fuerza al modelo a seguir el esquema JSON.
export async function chatJSON(messages, schema, retries = 1) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model(), messages, stream: false, format: schema,
        options: { ...OPTIONS, temperature: 0.3 },
      }),
    });
    if (!r.ok) await fail(r);
    const d = await r.json();
    try { return JSON.parse(d.message.content); }
    catch { if (attempt >= retries) throw new Error('Gemma no devolvió un formato válido. Inténtalo de nuevo.'); }
  }
}
