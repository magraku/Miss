// AI layer. Three engines, picked automatically:
//   1. Gemini Nano (Chrome built-in Prompt API) — instant, no download
//   2. WebLLM in a Web Worker (WebGPU) — the main path on desktop
//   3. nothing — read-only mode (mobile / no WebGPU)
// All inference is on-device: the document text never leaves the machine.
import { CONFIG } from './config.js';
import { t } from './i18n.js';

export const engineState = {
  backend: null,        // 'nano' | 'webllm' | null
  status: 'idle',       // idle | downloading | loading | ready | unsupported | error
  progress: 0,
  model: '',
  message: '',
};

const listeners = new Set();
export function onEngineChange(fn) { listeners.add(fn); fn(engineState); }
function patch(p) { Object.assign(engineState, p); listeners.forEach(f => f(engineState)); }

let _caps = null;
export async function probeCapabilities() {
  if (_caps) return _caps;
  const ua = navigator.userAgent;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(ua) ||
    (matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) < 820);
  const mem = navigator.deviceMemory || 8; // Chrome-only; assume OK elsewhere
  // 'gpu' existing ≠ WebGPU usable: requestAdapter() returns null on
  // unsupported hardware, VMs and remote desktops.
  let webgpu = false, gpuReason = '';
  if (!('gpu' in navigator)) { gpuReason = 'no-webgpu-api'; }
  else {
    try {
      const adapter = await Promise.race([
        navigator.gpu.requestAdapter(),
        new Promise(r => setTimeout(() => r('timeout'), 4000)),
      ]);
      webgpu = !!adapter && adapter !== 'timeout';
      if (!webgpu) gpuReason = 'no-adapter';
    } catch (e) { gpuReason = 'adapter-error'; }
  }
  _caps = {
    webgpu, mem, mobile, gpuReason,
    nano: 'LanguageModel' in self,
    canDownloadModel: webgpu && !mobile,
    cloudFallback: !mobile, // desktop CPU-only machines fall back to the free proxy
  };
  _caps.canGenerate = !mobile && (_caps.canDownloadModel || _caps.nano || _caps.cloudFallback);
  return _caps;
}

// Synchronous view for UI code that ran after probeCapabilities().
export function capabilities() {
  return _caps || { webgpu: false, mem: 8, mobile: false, nano: false, canGenerate: false, canDownloadModel: false, gpuReason: 'not-probed' };
}

/* ───────── Gemini Nano (Chrome Prompt API) ───────── */
let nanoSession = null;
async function nanoAvailable() {
  if (!('LanguageModel' in self)) return false;
  try { return (await LanguageModel.availability()) !== 'unavailable'; }
  catch { return false; }
}
async function nanoEnsure(onProgress) {
  if (nanoSession) return nanoSession;
  nanoSession = await LanguageModel.create({
    monitor(m) { m.addEventListener('downloadprogress', e => onProgress?.(e.loaded)); },
  });
  return nanoSession;
}
const NANO_MAX_CHARS = 11000; // Nano's context is small — keep total prompt under ~3-4k tokens
function nanoPrompt(messages) {
  let total = 0;
  const fitted = [];
  for (const m of messages) {
    const room = Math.max(0, NANO_MAX_CHARS - total);
    const content = m.content.length > room ? m.content.slice(0, room) + '\n[…]' : m.content;
    total += content.length;
    fitted.push({ ...m, content });
  }
  return fitted.map(m => `<|${m.role}|>\n${m.content}`).join('\n\n') + '\n<|assistant|>\n';
}
async function* nanoStream(messages) {
  const s = await nanoEnsure();
  const stream = s.promptStreaming(nanoPrompt(messages));
  for await (const chunk of stream) yield chunk;
}

/* ───────── WebLLM (Web Worker) ───────── */
let worker = null, engine = null, webllm = null;

async function pickModel() {
  const { mem } = capabilities();
  const list = webllm.prebuiltAppConfig.model_list.map(m => m.model_id);
  const prefs = mem >= CONFIG.RAM_FULL_MODEL_GB ? CONFIG.MODELS_DESKTOP : CONFIG.MODELS_LIGHT;
  for (const p of prefs) {
    const hit = list.find(id => id.toLowerCase().includes(p.toLowerCase()));
    if (hit) return hit;
  }
  return list.find(id => /1b|1\.7b|2b/i.test(id)) || list[0];
}

async function webllmLoad(onProgress) {
  if (engine) return;
  webllm = await import(CONFIG.WEBLLM_CDN);
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const modelId = await pickModel();
  engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
    initProgressCallback: r => onProgress?.(r.progress, r.text),
  });
  patch({ model: modelId });
}

async function* webllmStream(messages) {
  const chunks = await engine.chat.completions.create({
    messages, stream: true, temperature: 0.4, max_tokens: 2048,
  });
  for await (const c of chunks) {
    const d = c.choices[0]?.delta?.content;
    if (d) yield d;
  }
}

async function webllmJSON(messages, schema) {
  const r = await engine.chat.completions.create({
    messages, stream: false, temperature: 0.3, max_tokens: 2048,
    response_format: { type: 'json_object', schema: JSON.stringify(schema) },
  });
  return r.choices[0]?.message?.content || '';
}

/* ───────── Public API (same shape as the old Ollama client) ───────── */

// Starts whichever backend the device supports. Safe to call repeatedly.
export async function connect() {
  if (engineState.status === 'ready' || engineState.status === 'loading' || engineState.status === 'downloading') return;
  const caps = await probeCapabilities();
  try {
    if (await nanoAvailable()) {
      // Lazy: create() needs a user gesture when the model isn't downloaded yet,
      // so the session is only opened on the first real generation call.
      patch({ backend: 'nano', status: 'ready', model: 'Gemini Nano' });
      return;
    }
    if (caps.canDownloadModel) {
      patch({ backend: 'webllm', status: 'downloading', progress: 0,
              message: t('home.downloading', { p: 0 }) });
      await webllmLoad((p) => patch({
        status: p >= 1 ? 'loading' : 'downloading', progress: p,
        message: p >= 1 ? t('home.waking') : t('home.downloading', { p: Math.round(p * 100) }),
      }));
      patch({ status: 'ready' });
      return;
    }
    if (caps.cloudFallback) {
      // Desktop without WebGPU and without Nano → free cloud proxy.
      try {
        const r = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        // 400 means the function exists but rejected our probe — good enough.
        // 404 = no function (local static server), 503 = AI_API_KEY missing.
        if (r.status === 404 || r.status === 503) throw new Error('no-cloud');
        patch({ backend: 'cloud', status: 'ready', model: 'Cloud (free)' });
        return;
      } catch {
        patch({ backend: null, status: 'unsupported',
                message: `${t('home.noWebgpu')} [${caps.gpuReason}+no-cloud]` });
        return;
      }
    }
    patch({ backend: null, status: 'unsupported',
            message: `${t('home.noWebgpu')} [${caps.gpuReason}${caps.mobile ? '+mobile' : ''}]` });
  } catch (e) {
    console.warn('engine init failed', e);
    patch({ backend: null, status: 'error', message: `${t('home.reconnect')} — ${e.message}` });
  }
}

/* ───────── Cloud fallback (Vercel function → Groq free tier) ───────── */
async function cloudFetch(messages, json = false) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, json }),
  });
  if (!res.ok) throw new Error(`cloud ${res.status}`);
  return res;
}

async function* sseTokens(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const ln of lines) {
      const l = ln.trim();
      if (!l.startsWith('data:')) continue;
      const data = l.slice(5).trim();
      if (data === '[DONE]') return;
      try { const d = JSON.parse(data)?.choices?.[0]?.delta?.content; if (d) yield d; } catch { /* partial */ }
    }
  }
}

function needReady() {
  if (engineState.status !== 'ready') throw new Error(t('err.noModel'));
}

export async function* chatStream(messages) {
  needReady();
  const b = engineState.backend;
  if (b === 'nano') yield* nanoStream(messages);
  else if (b === 'cloud') yield* sseTokens(await cloudFetch(messages));
  else yield* webllmStream(messages);
}

export async function chatJSON(messages, schema, retries = 2) {
  needReady();
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let raw;
      if (engineState.backend === 'nano') {
        const s = await nanoEnsure();
        raw = await s.prompt(nanoPrompt(messages), { responseConstraint: schema });
      } else if (engineState.backend === 'cloud') {
        raw = '';
        for await (const d of sseTokens(await cloudFetch(messages, true))) raw += d;
      } else {
        raw = await webllmJSON(messages, schema);
      }
      // Tolerant parse: strip code fences / leading prose, take the JSON object.
      const m = String(raw).match(/\{[\s\S]*\}/);
      return JSON.parse(m ? m[0] : raw);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error(t('err.notJson'));
}

export function currentModel() { return engineState.model; }
