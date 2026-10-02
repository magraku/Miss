// MissPedia — free-tier AI fallback for devices with no WebGPU and no Gemini
// Nano. Runs on Vercel (serverless). The upstream key lives in the AI_API_KEY
// env var — never in client code. Quota is shared across all visitors.
//
// Configure in Vercel → Project → Environment Variables:
//   AI_API_KEY = gsk_…        (console.groq.com, free)
//   AI_MODEL   = llama-3.3-70b-versatile  (optional override)

const UPSTREAM = process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';
const MAX_BODY = 120 * 1024;         // ~120KB of prompt is already generous
const MAX_TOKENS = 2048;

// Tiny per-IP token bucket (resets on cold start — good enough for v1)
const buckets = new Map();
const LIMIT = 30, WINDOW_MS = 60_000;
function allowed(ip) {
  const now = Date.now();
  const b = buckets.get(ip) || { n: 0, reset: now + WINDOW_MS };
  if (now > b.reset) { b.n = 0; b.reset = now + WINDOW_MS; }
  b.n += 1; buckets.set(ip, b);
  return b.n <= LIMIT;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const key = process.env.AI_API_KEY;
  if (!key) return res.status(503).json({ error: 'AI_API_KEY not configured' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'anon';
  if (!allowed(ip)) return res.status(429).json({ error: 'rate limit — try again in a minute' });

  const body = req.body;
  if (!body || !Array.isArray(body.messages) || !body.messages.length)
    return res.status(400).json({ error: 'messages required' });
  if (JSON.stringify(body).length > MAX_BODY)
    return res.status(413).json({ error: 'prompt too large' });

  const messages = body.messages
    .filter(m => m && typeof m.content === 'string')
    .map(m => ({ role: ['system', 'user', 'assistant'].includes(m.role) ? m.role : 'user', content: m.content }));

  const payload = {
    model: MODEL,
    messages,
    temperature: body.temperature ?? 0.4,
    max_tokens: Math.min(body.max_tokens ?? MAX_TOKENS, MAX_TOKENS),
    stream: true,
  };
  if (body.json) payload.response_format = { type: 'json_object' };

  try {
    const up = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!up.ok) {
      const txt = await up.text().catch(() => '');
      return res.status(up.status).json({ error: `upstream ${up.status}`, detail: txt.slice(0, 300) });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    const reader = up.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (e) {
    res.status(502).json({ error: 'upstream unreachable', detail: String(e).slice(0, 200) });
  }
};
