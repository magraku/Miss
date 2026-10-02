# MissPedia · learn calmly

A study app that runs **in your browser**. Drop a PDF (or paste notes), and an
on-device AI turns it into a course: lessons, flashcards, quizzes — in English
or French. Sign in with a magic link to sync courses across devices (generate
on desktop, review on your phone).

- **No server, no account required.** The AI picks the best engine your
  device supports — Gemini Nano (recent Chrome), WebLLM in a WebGPU worker,
  or a free cloud proxy (`api/generate.js` → Groq free tier) for CPU-only
  desktops. Mobile = review mode only.
- **Free public APIs** from the [public-apis](https://github.com/public-apis/public-apis)
  catalog are matched to your document's subject and woven into lessons and
  answers.
- **Focus timer** (25/30/45/50 min), streaks and XP.
- **Supabase** magic-link sync (optional): see `supabase/schema.sql`.

## Requirements

- A desktop browser with **WebGPU** (Chrome/Edge 113+, Safari 26+, Firefox 141+).
- First load downloads the AI model (~1–3 GB once, cached afterwards — the app
  then works offline).
- Internet on first load (fonts, pdf.js, model). On mobile the app opens in
  review mode: flashcards, quizzes and lessons sync'd from your desktop.

## Run

No build step. From this folder:

```bash
npx serve .
# or: python -m http.server 8000
```

Open the printed URL — do not double-click `index.html` (ES modules need a server).

## Configure

`js/config.js`:

| Key | Purpose |
|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | project URL + **publishable** key. Empty = local-only mode. |
| `DONATE_URL` | donation link in the header |
| `MODELS_DESKTOP` / `MODELS_LIGHT` | model preference order (auto-picked vs `deviceMemory`) |

Supabase setup: run `supabase/schema.sql` in the SQL editor, enable Email OTP
(Authentication → Providers), add your site URL to Auth → URL Configuration.

## Deploy (Vercel)

Static site + one serverless function. Deploy the folder as-is (`vercel deploy`
or import the repo with Root Directory = `miss/`).

Cloud fallback env vars (optional — without them CPU-only desktops show the
"no generation" banner):

| Var | Value |
|---|---|
| `AI_API_KEY` | `gsk_…` from console.groq.com (free) |
| `AI_MODEL` | optional, default `llama-3.3-70b-versatile` |

The Supabase anon key stays public by design (RLS protects rows).

## Structure

```
index.html          views: home / library / data-deck
css/styles.css      light editorial theme
js/app.js           views, file intake, lessons, ask
js/llm.js           AI adapter: Gemini Nano → WebLLM worker
js/worker.js        WebLLM web worker host
js/study.js         flashcards (Leitner) + quiz
js/timer.js         focus timer
js/docs.js          pdf.js v4, sectioning, FR/EN TF-IDF retrieval
js/apilib.js        public-apis catalog matching + search
js/store.js         localStorage state; bodies in IndexedDB (db.js)
js/sync.js          Supabase auth + course sync
js/i18n.js          EN/FR strings
js/instructional.js bilingual pedagogical prompts
data/apis.json      1 966 free APIs (parsed from public-apis)
```

## License

MIT
