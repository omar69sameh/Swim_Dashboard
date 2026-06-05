-- Run this in: Supabase Dashboard → SQL Editor
--
-- Creates session_strokes: one row per stroke, linked to session_analysis.
-- This replaces parsing strokes_json on the frontend.

CREATE TABLE IF NOT EXISTS session_strokes (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id            UUID        NOT NULL,
  stroke_index          INTEGER     NOT NULL,
  stroke_type           TEXT        NOT NULL,   -- e.g. "Breaststroke"
  quality_tier          TEXT,                   -- "low" | "moderate" | "moderate_high" | "high"
  quality_label         TEXT,                   -- "Good" | "Bad"
  confidence            FLOAT8,                 -- 0.0–1.0 (model classification confidence)
  start_time            FLOAT8,                 -- seconds from session start
  peak_time             FLOAT8,
  end_time              FLOAT8,
  predicted_stroke_type TEXT,                   -- raw pipeline label e.g. "Breast_high"
  created_at            TIMESTAMPTZ DEFAULT now(),

  -- Prevent duplicate strokes being inserted for the same session
  UNIQUE (session_id, stroke_index)
);

-- Fast lookup by session (used by the dashboard on every session open)
CREATE INDEX IF NOT EXISTS idx_session_strokes_session_id
  ON session_strokes (session_id);

-- Enable Row Level Security
ALTER TABLE session_strokes ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to read strokes
-- (same access model as session_analysis — the API layer enforces swimmer/coach boundaries)
CREATE POLICY "session_strokes_select"
  ON session_strokes FOR SELECT
  USING (true);

-- Allow the service role (ML pipeline + API) to insert/update
CREATE POLICY "session_strokes_insert"
  ON session_strokes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "session_strokes_upsert"
  ON session_strokes FOR UPDATE
  USING (true);
