# SwimML Analytics Dashboard

Integration-ready swimming progress app for **coaches** and **swimmers**. Next.js 15, TypeScript, Tailwind CSS, **service layer** (microservice-style clients), **BFF API routes**, and **presentational components**.

## Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Coach | `coach@demo.com` | `coach123` |
| Swimmer | `sarah@demo.com` | `swim123` |
| Swimmer | `marcus@demo.com` | `swim123` |

## What each role sees

| Role | Home | Features |
|------|------|----------|
| **Coach** | `/coach` | Assigned swimmers; **Freestyle / Breaststroke / Butterfly** quality each |
| **Swimmer** | `/swimmer` | Own progress only; 3 stroke scores; last session |

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → `/login`.

Production build:

```bash
npm run build
npm start
```

### Environment

Copy `.env.example` to `.env.local`:

| Variable | Values | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_DATA_PROVIDER` | `mock` (default) or `api` | Mock services vs BFF fetch |
| `NEXT_PUBLIC_API_BASE_URL` | empty or gateway URL | API base when using external gateway |

## Routes

| Route | Description |
|-------|-------------|
| `/login`, `/signup` | Auth (mock) |
| `/coach` | Coach home |
| `/coach/swimmer/[id]` | Swimmer detail + stroke scores |
| `/coach/session/[id]` | Session analysis |
| `/swimmer` | Swimmer home |
| `/swimmer/session/[id]` | Own session analysis |
| `/settings` | Profile + sign out |

## Architecture (summary)

### Microservice-style clients (`services/`)

`getSwimmerService()`, `getSessionService()`, `getMLAnalysisService()`, `getAuthService()`, etc. Each has **mock** and **api** implementations.

### BFF (`app/api/`)

Browser → `/api/*` → (today) mock data → (later) Supabase + ML API.

### Components (`components/`)

Feature UI only; data via **props** from pages that call **hooks**.

### Hooks (`hooks/`)

`useAuth`, `useSwimmers`, `useSessions`, `useMLResults`, `useHistoricalData`, …

## Integrating the backend

1. **Auth** — Supabase Auth in `app/api/auth/*`; remove demo users from production.
2. **Dashboard DB** — Supabase B in `app/api/swimmers`, `sessions`, `history`.
3. **ML** — `app/api/sessions/[id]/ml-results` → Python pipeline.
4. **Assignments** — `coach_assignments` table; filter in BFF by JWT/session.
5. **Ingestion** — Mobile app → Supabase A → worker → Dashboard DB (not in this app).

## Tracked strokes

Dashboard quality is shown for **Freestyle**, **Breaststroke**, and **Butterfly** (see `TRACKED_STROKES` in `lib/stroke-scores.ts`).
