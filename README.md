# SwimML Analytics

**AI-powered swimming stroke & technique analysis using wrist-worn inertial sensors.**

SwimML Analytics is an end-to-end platform that captures a swimmer's wrist motion, classifies the stroke and scores its quality with a deep-learning model, and presents objective, role-based feedback to coaches and swimmers — replacing subjective, manual stroke assessment with repeatable, data-driven analysis.

> Graduation project — B.Sc. Software Engineering, MSA University (in academic partnership with the University of Greenwich), June 2026.
> Developed by **Omar Samh Elsayed Mohamed (231969)** and **Khaled Amr Mohamed Shamseldin (237857)**, in collaboration with **Hola Swimming Academy**.

---

## Table of Contents

1. [What it is](#what-it-is)
2. [System architecture](#system-architecture)
3. [Repository structure](#repository-structure)
4. [Technology stack](#technology-stack)
5. [Data model](#data-model)
6. [Authentication & access control](#authentication--access-control)
7. [Machine-learning pipeline](#machine-learning-pipeline)
8. [Getting started](#getting-started)
9. [Environment variables](#environment-variables)
10. [Demo accounts](#demo-accounts)
11. [Routes & API](#routes--api)
12. [Testing & quality assurance](#testing--quality-assurance)
13. [Known limitations](#known-limitations)
14. [Documentation](#documentation)

---

## What it is

The platform is composed of **four cooperating subsystems**:

| # | Subsystem | Role | Tech |
|---|-----------|------|------|
| 1 | **Mobile capture app** | Records 6-axis IMU data (accelerometer 100 Hz, gyroscope 60 Hz) during a swim and uploads each session | Flutter / Dart (Android) |
| 2 | **ML pipeline** | Cleans, segments, and classifies strokes; scores quality | Python · PyTorch · scikit-learn |
| 3 | **Cloud backend** | Auth, storage, relational data, and row-level security | Supabase (PostgreSQL) |
| 4 | **Web dashboard** | Role-based analytics for coaches, swimmers, and admins | Next.js 15 · TypeScript · Tailwind CSS |

The flow: **capture → upload → automated analysis → dashboard**. A session recorded on the phone is uploaded to Supabase with `analysis_status = pending`; a FastAPI worker picks it up, runs the GRU-LSTM model, writes the result back (`completed`/`failed`), and the dashboard displays the stroke type, a 0–100 quality score, and a per-stroke breakdown.

---

## System architecture

A four-tier, service-oriented hub-and-spoke design:

```
┌────────────────┐     upload (CSV + samples)     ┌──────────────────────┐
│  Mobile App    │ ─────────────────────────────▶ │   Supabase (cloud)   │
│  (Flutter)     │                                 │  PostgreSQL + Auth   │
└────────────────┘                                 │  Storage + RLS       │
                                                    └──────────┬───────────┘
┌────────────────┐    BFF API (/api/*)   ┌──────────────┐      │ poll pending
│  Web Dashboard │ ◀───────────────────▶ │  Next.js BFF │ ◀────┤
│  (Next.js)     │   RBAC + service layer │  route       │      │ write result
└────────────────┘                        └──────────────┘      ▼
                                                    ┌──────────────────────┐
                                                    │  ML Service (FastAPI)│
                                                    │  GRU-LSTM worker     │
                                                    └──────────────────────┘
```

- **BFF (Backend-for-Frontend):** in `api` mode the dashboard never talks to Supabase directly — it goes through Next.js route handlers under `app/api/*`, which enforce role-based access control.
- **Provider switch:** a single env flag (`NEXT_PUBLIC_DATA_PROVIDER`) swaps the entire data layer between `mock` (offline demo data) and `api` (live Supabase) with zero UI changes — implemented via a Factory + Strategy service layer.
- **Defence in depth:** access is enforced at *two* independent layers — RBAC in the BFF and Row-Level Security in PostgreSQL.

---

## Repository structure

```
swim-ml-dashboard/
├── app/                  # Next.js 15 App Router
│   ├── (auth)/           # login, signup, forgot/reset password
│   ├── (dashboard)/      # coach, swimmer, admin, profile, settings
│   └── api/              # BFF route handlers (auth, swimmers, sessions, admin, …)
├── components/           # presentational UI (cards, gauges, charts, modals)
├── hooks/                # useAuth, useSwimmers, useSessions, useMLResults, …
├── services/             # microservice-style clients (mock + api) per domain
│   ├── auth/ swimmers/ sessions/ ml-analysis/ coaches/ admin/ historical/
│   ├── config.ts         # provider selection
│   └── http-client.ts    # typed fetch with 30 s TTL cache + ServiceError
├── lib/                  # access control, stroke-score logic, utils, mock-auth
├── types/                # shared domain & auth types
├── supabase/migrations/  # SQL schema + RLS policies (001–004)
├── ml-service/           # FastAPI inference service + polling worker
│   └── app/ (main.py · config.py · db.py · inference/ · worker/)
├── ml_pipeline/          # model training, evaluation, GRU-LSTM + experiments
├── mobileApp/            # Flutter IMU capture app (Android)
├── gradtesting/          # QA artifacts: Katalon scripts, Postman, docs, screenshots
├── __tests__/            # Jest unit + integration tests
└── thesis-figures/       # generated diagrams & figures for the dissertation
```

---

## Technology stack

| Layer | Technologies |
|-------|--------------|
| **Mobile** | Flutter, Dart, `sensors_plus`, `supabase_flutter` |
| **ML** | Python 3.10+, PyTorch (GRU-LSTM + multi-head attention), scikit-learn, NumPy, SciPy, pandas |
| **ML service** | FastAPI, Uvicorn, Supabase Python client |
| **Backend** | Supabase — PostgreSQL, Auth (JWT), Storage, Row-Level Security |
| **Dashboard** | Next.js 15 (App Router, Turbopack), TypeScript, Tailwind CSS, Recharts, Framer Motion, Zustand |
| **Testing** | Katalon Studio 9.x + Appium 2.x, Postman, Jest + ts-jest, Flutter test |

---

## Data model

Supabase / PostgreSQL, normalised to 3NF with `jsonb` columns for high-volume capture payloads. Four application tables plus the managed `auth.users`:

| Table | Key | Purpose |
|-------|-----|---------|
| `profiles` | `id` (PK, FK → `auth.users`) | User profile; `role` (coach / swimmer / admin) and self-referencing `coach_id` (coach–swimmer assignment) |
| `swimming_sessions` | `id` (PK), `user_id` (FK) | One recorded session; `jsonb` payloads (`samples`, `swimmer_info`, …), `csv_content`, and `analysis_status` (`pending`/`processing`/`completed`/`failed`) |
| `session_analysis` | `session_id` (PK, FK → session) | One-per-session ML summary: `primary_stroke`, `quality_tier`, `quality_score` (0–100), `num_strokes` |
| `session_strokes` | `id` (PK), `session_id` (FK) | Many-per-session normalised per-stroke detail (type, confidence, timing) |

RLS policies live in `supabase/migrations/001–004`.

---

## Authentication & access control

- **Live authentication** via Supabase Auth: sign-up, sign-in, password reset, and change-password (no demo-only stubs in `api` mode).
- **Role-Based Access Control (RBAC)** enforced in the BFF route handlers — coaches see only assigned swimmers; swimmers see only their own data; admin routes are admin-only.
- **Row-Level Security (RLS)** enforced independently at the database, so a bypass at the application layer is still blocked by PostgreSQL.
- **Rate limiting:** login is limited to 10 attempts/min/IP (HTTP 429).

Access-control logic lives in `lib/access.ts` (`canAccessSwimmer`, `getSessionFilters`, `homePathForRole`). Both `/api/swimmers` and `/api/sessions` run the authentication check first and return **403** for any unassigned request.

---

## Machine-learning pipeline

The proposed model is a **segmented GRU-LSTM with 4-head attention**, selected as the best of three architectures evaluated (GRU baseline, Deep CNN-BiLSTM, GRU-LSTM).

**Pipeline stages:** data cleaning (Butterworth low-pass, 5 Hz; outlier removal; standard scaling) → augmentation (rotation, scaling, time-warp, noise) → peak-to-peak segmentation → GRU-LSTM classification.

**Outputs:** stroke type (Freestyle / Breaststroke / Butterfly), stroke count, a 0–100 quality score across four tiers, and a per-stroke breakdown.

**Dataset & results** (held-out, above-water data; see thesis Ch. 4):

| Metric | Result |
|--------|--------|
| Dataset | 90 sessions · 18 swimmers · ~2,400 samples/session |
| Stroke-type accuracy | **99.6%** (target ≥ 95%) |
| Quality (Good/Bad) accuracy / F1 | **82.6% / 82.5%** (target ≥ 80%) |

> Models are calibrated on above-water data; underwater and transition phases are out of the calibration scope. The quality score is a technique proxy, not a clinically validated injury label.

---

## Getting started

### 1. Web dashboard

```bash
npm install
npm run dev            # http://localhost:3000  (Turbopack)
# production:
npm run build && npm start
```

By default the dashboard runs in **mock mode** (no backend needed). For live data, set the Supabase env vars (below) and `NEXT_PUBLIC_DATA_PROVIDER=api`.

### 2. ML service (optional — for live analysis)

```bash
cd ml-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000   # FastAPI + /health
# the worker polls Supabase for pending sessions
```

### 3. Mobile app (optional)

```bash
cd mobileApp
flutter pub get
flutter run            # Android device/emulator
# or build an APK:
build-apk.bat
```

---

## Environment variables

Copy `.env.example` → `.env.local` (never commit `.env.local`):

| Variable | Values | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_DATA_PROVIDER` | `mock` (default) / `api` | Mock data vs live Supabase via the BFF |
| `NEXT_PUBLIC_API_BASE_URL` | empty / gateway URL | API base when using an external gateway |
| `SUPABASE_URL` | project URL | Supabase project |
| `SUPABASE_ANON_KEY` | publishable key | Client/anon access |
| `SUPABASE_SERVICE_ROLE_KEY` | secret key | **Server/scripts only** — bypasses RLS; never expose to the client |
| `ML_SERVICE_URL` | e.g. `http://localhost:8000` | ML worker endpoint (optional) |
| `ML_POLL_INTERVAL_SEC` | e.g. `30` | Worker poll interval (optional) |

> ⚠️ Keep `SUPABASE_SERVICE_ROLE_KEY` out of version control and rotate it if it is ever exposed.

Useful scripts: `npm run inspect:supabase` (dump live schema), `npm run backfill:analysis` (queue pending sessions).

---

## Demo accounts

**Mock mode** (offline, zero-config):

| Role | Email | Password |
|------|-------|----------|
| Coach | `coach@demo.com` | `coach123` |
| Swimmer | `sarah@demo.com` | `swim123` |
| Swimmer | `marcus@demo.com` | `swim123` |

---

## Routes & API

**Pages:** `/login` · `/signup` · `/forgot-password` · `/reset-password` · `/coach` · `/coach/swimmer/[id]` · `/coach/session/[id]` · `/coach/compare` · `/swimmer` · `/swimmer/session/[id]` · `/swimmer/compare` · `/profile` · `/settings` · `/admin`.

**BFF API (`app/api/*`):** `auth/*` (login, signup, logout, session, change-password, forgot-password) · `swimmers`, `swimmers/[id]`, `swimmers/[id]/history` · `sessions`, `sessions/[id]`, `sessions/[id]/ml-results` · `coaches` · `profile` · `admin/*` (users, sessions, strokes).

---

## Testing & quality assurance

A multi-tier strategy (artifacts in `gradtesting/`, full write-up in thesis Chapter 5):

| Level | Tooling | Coverage | Result |
|-------|---------|----------|--------|
| System / black-box | Katalon Studio (web) + Appium (mobile) | 80 test cases (60 web, 20 mobile) | **77 pass / 3 fail** |
| Unit | Jest (dashboard) + Flutter test | 74 tests | 71 pass / 3 fail (by design — exposed defects) |
| Integration | Jest + Flutter | 14 scenarios | all pass |
| API | Postman (42 assertions) | auth, RLS, storage | aligned with system results |
| Usability (UAT) | System Usability Scale (5 users) | coach + swimmer flows | **SUS 82 ("Good")** |

Test cases trace to functional requirements **FR-01–FR-43** and non-functional requirements **NFR-01–NFR-36** via the traceability matrix.

---

## Known limitations

- **BUG-01** (cosmetic) — a ~150 ms content flash before a cross-role redirect; deferred.
- **BUG-03** — change-password fails for one SQL-imported account (data-seeding issue); open.
- **BUG-04** — mobile sign-up lacks a client-side age bound (rejected server-side); open.
- Models calibrated on **above-water** data only; **single wrist sensor** cannot capture full-body dynamics.
- Analysis is **post-session** (polling worker), not real-time; performance verified single-user only.
- Data protection is **RLS + RBAC**; full GDPR consent/erasure tooling is future work.

*(BUG-02 broken coach access and BUG-05 swimmer data-isolation were fixed and verified closed.)*

---

## Documentation

- **Thesis figures:** `thesis-figures/` (architecture, UML, ERD, UI, Gantt, defect lifecycle).
- **QA artifacts:** `gradtesting/` (Katalon scripts, Postman collections, test plan, bug report, traceability matrix, usability report, screenshots).
- **Project-management deliverables:** `SwimMate-SPM/`.

---

*Academic project — not deployed as a public production service. © 2026 Omar Samh & Khaled Amr.*
