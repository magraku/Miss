// Central configuration — fill in before deploying.
export const CONFIG = {
  // Supabase (Settings → API in your dashboard). The anon key is safe to expose:
  // row-level security protects every row. Leave empty to run without accounts.
  SUPABASE_URL: 'https://aamdgwttwbtzafamphfh.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhbWRnd3R0d2J0emFmYW1waGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NDUzNzEsImV4cCI6MjEwNjUyMTM3MX0.lPPtoyuhtYcRl3sTBUdpPoGZYY-t0AYaisF0y_SwHt8',

  // Donation link shown in the header (wired later).
  DONATE_URL: '',

  // Preferred in-browser models, tried in order against the WebLLM registry.
  // First entry fitting the device wins.
  MODELS_DESKTOP: [
    'gemma-3-4b-it', 'Qwen3-4B', 'Llama-3.2-3B-Instruct', 'Phi-3.5-mini-instruct',
  ],
  MODELS_LIGHT: [
    'gemma-3-1b-it', 'Qwen3-1.7B', 'SmolLM2-1.7B-Instruct', 'Llama-3.2-1B-Instruct',
  ],
  // Minimum device RAM (GB) to offer the full-size model.
  RAM_FULL_MODEL_GB: 8,

  WEBLLM_CDN: 'https://esm.run/@mlc-ai/web-llm',
};
