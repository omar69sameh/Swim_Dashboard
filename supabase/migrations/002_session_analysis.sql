-- Run once in Supabase SQL Editor (project: imu_reader)

alter table swimming_sessions
  add column if not exists analysis_status text default 'pending'
    check (analysis_status in ('pending', 'processing', 'completed', 'failed')),
  add column if not exists analysis_error text,
  add column if not exists analyzed_at timestamptz;

create index if not exists swimming_sessions_analysis_status_idx
  on swimming_sessions (analysis_status);

create table if not exists session_analysis (
  session_id uuid primary key references swimming_sessions(id) on delete cascade,
  primary_stroke text not null,
  stroke_confidence double precision,
  quality_tier text,
  quality_label text,
  quality_score integer check (quality_score >= 0 and quality_score <= 100),
  num_strokes integer default 0,
  strokes_json jsonb,
  pipeline_version text not null default 'segmented-v1',
  created_at timestamptz not null default now()
);

create index if not exists session_analysis_primary_stroke_idx
  on session_analysis (primary_stroke);

-- Existing sessions without analysis: queue for worker
update swimming_sessions
set analysis_status = 'pending'
where analysis_status is null;
