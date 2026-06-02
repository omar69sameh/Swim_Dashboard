# SwimML Analysis Service

Runs the segmented `ml_pipeline` on `swimming_sessions` and writes results to `session_analysis`.

## Prerequisites

1. Run SQL migrations in Supabase:
   - `supabase/migrations/001_profiles_role_coach.sql`
   - `supabase/migrations/002_session_analysis.sql`

2. Python 3.10+ and model files in `ml_pipeline/`:
   - `best_model_segmented.pth`
   - `scaler_segmented.pkl`
   - `label_mapping_segmented.pkl`
   - `hyperparameters_segmented.pkl`

## Environment

Uses the same `.env.local` as the dashboard (repo root) or `ml-service/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ML_PIPELINE_ROOT=../ml_pipeline   # optional
ML_POLL_INTERVAL_SEC=30
```

## Install

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

## Run API

From `ml-service/`:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- Health: `GET http://localhost:8000/health`
- Analyze one session: `POST http://localhost:8000/analyze/{session_id}`

## Run background worker

```bash
python -m app.worker.poll
```

Polls `swimming_sessions` where `analysis_status = 'pending'`, runs analysis, sets `completed` or `failed`.

## VPS (systemd sketch)

Run API and worker as two services pointing at this directory and the same `.env`.

## Local dev with dashboard

1. `npm run dev` (dashboard)
2. `uvicorn app.main:app --reload --port 8000` (ml-service)
3. `python -m app.worker.poll` (worker)
