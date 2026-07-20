# Stratverse — Live Build Roadmap

A tiny Next.js app that renders the Stratverse portal build roadmap **live from Linear**.
The page and a serverless proxy (`/api/roadmap`) run on the server and read Linear using an
API key stored in an environment variable — the key is **never** exposed to the browser, so the
page is safe to make fully public.

- `app/page.tsx` — the roadmap page (master roadmap + a Gantt per portal), server-rendered.
- `app/api/roadmap/route.ts` — JSON proxy you can also call directly.
- `lib/linear.ts` — the only place that talks to Linear (holds the query + auth).

---

## What you need

1. A **Linear Personal API key** — Linear → Settings → Security & access → **Personal API keys** → *New key*. Copy it (`lin_api_…`).
2. A free **Vercel** account (vercel.com).
3. Node 18+ installed if you want to run it locally first (optional).

---

## Deploy to Vercel — step by step

You can deploy straight from your machine with the Vercel CLI (no GitHub needed), or via GitHub. CLI is fastest.

### Option 1 — Vercel CLI (fastest)

```bash
# 1. From this folder, install dependencies
npm install

# 2. (optional) run locally to check it works — see "Run locally" below

# 3. Install the Vercel CLI and log in
npm i -g vercel
vercel login

# 4. Deploy. Answer the prompts (accept defaults; it detects Next.js automatically).
vercel

# 5. Add your Linear key as an environment variable (Production + Preview + Development)
vercel env add LINEAR_API_KEY
#   → paste your lin_api_... key when prompted, choose all environments

# 6. Deploy to production with the env var applied
vercel --prod
```

You'll get a public URL like `https://stratverse-roadmap.vercel.app`.

### Option 2 — GitHub + Vercel dashboard

1. Push this folder to a new GitHub repo.
2. On vercel.com → **Add New → Project** → import the repo. Framework preset auto-detects **Next.js**; leave build settings default.
3. Before the first deploy, open **Environment Variables** and add:
   - `LINEAR_API_KEY` = your `lin_api_…` key
   - (optional) `LINEAR_TEAM_ID` = `1760cbd0-fb5e-4347-b7fb-ebff5fe2e64e` (already the default)
4. Click **Deploy**. Done.

---

## Run locally (optional)

```bash
npm install
cp .env.example .env.local     # then edit .env.local and paste your key
npm run dev                    # http://localhost:3000
```

---

## How updates work

The page caches Linear's response for **5 minutes** (`revalidate = 300`). Change a project or
milestone date in Linear, wait up to ~5 minutes (or trigger a redeploy), and the public page
updates automatically. No code change or manual re-export needed.

To change the refresh interval, edit `revalidate` in `app/page.tsx`, `app/api/roadmap/route.ts`,
and `lib/linear.ts`.

## Making it public

Next.js apps on Vercel are public by default. If you enabled **Deployment Protection** (Vercel →
Project → Settings → Deployment Protection), turn it off (or add a public bypass) so anyone with
the link can view the roadmap.

## Security notes

- The Linear API key lives only in Vercel's server environment; it is never sent to the browser.
- The public page and `/api/roadmap` only ever expose project names, colours, and dates — no issue
  contents, assignees, or anything sensitive. Widen `lib/linear.ts` carefully if you add fields.
