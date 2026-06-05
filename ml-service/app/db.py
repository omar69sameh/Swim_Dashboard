"""Supabase access for ml-service."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import create_client, Client

from app.config import get_supabase_service_key, get_supabase_url

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(get_supabase_url(), get_supabase_service_key())
    return _client


def fetch_session(session_id: str) -> dict[str, Any]:
    res = (
        get_client()
        .table("swimming_sessions")
        .select("id, user_id, samples, csv_content, analysis_status")
        .eq("id", session_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise ValueError(f"Session not found: {session_id}")
    return res.data


def set_analysis_status(
    session_id: str,
    status: str,
    error: str | None = None,
) -> None:
    payload: dict[str, Any] = {"analysis_status": status}
    if error is not None:
        payload["analysis_error"] = error
    if status == "completed":
        payload["analyzed_at"] = datetime.now(timezone.utc).isoformat()
    if status in ("pending", "processing"):
        payload["analysis_error"] = None

    get_client().table("swimming_sessions").update(payload).eq("id", session_id).execute()


STROKE_MAP = {
    "freestyle": "Freestyle", "butterfly": "Butterfly",
    "breast": "Breaststroke", "breaststroke": "Breaststroke",
    "backstroke": "Backstroke", "im": "IM",
}

def _normalize_stroke(raw: str | None) -> str:
    if not raw:
        return "Freestyle"
    lower = str(raw).lower().replace("-", "_").replace(" ", "_")
    for key, val in STROKE_MAP.items():
        if lower.startswith(key) or f"_{key}_" in f"_{lower}_" or lower.endswith(f"_{key}"):
            return val
    return "Freestyle"


def upsert_session_analysis(session_id: str, result: dict[str, Any]) -> None:
    row = {
        "session_id": session_id,
        "primary_stroke": result["primary_stroke"],
        "stroke_confidence": result.get("stroke_confidence"),
        "quality_tier": result.get("quality_tier"),
        "quality_label": result.get("quality_label"),
        "quality_score": result.get("quality_score"),
        "num_strokes": result.get("num_strokes", 0),
        "strokes_json": result.get("strokes_json", []),
        "pipeline_version": result.get("pipeline_version", "segmented-v1"),
    }
    get_client().table("session_analysis").upsert(row).execute()

    # Also write each stroke as its own row in session_strokes
    stroke_rows = result.get("strokes_json", [])
    if stroke_rows:
        _upsert_session_strokes(session_id, stroke_rows)


def _upsert_session_strokes(session_id: str, stroke_rows: list[dict[str, Any]]) -> None:
    """Insert one row per stroke into session_strokes (idempotent)."""
    rows = []
    for i, s in enumerate(stroke_rows):
        rows.append({
            "session_id":            session_id,
            "stroke_index":          int(s.get("stroke_index", i + 1)),
            "stroke_type":           _normalize_stroke(s.get("segmentation_style") or s.get("predicted_stroke_type")),
            "quality_tier":          s.get("quality_tier"),
            "quality_label":         s.get("predicted_quality"),
            "confidence":            float(s["confidence"]) if s.get("confidence") is not None else None,
            "start_time":            float(s["start_time"]) if s.get("start_time") is not None else None,
            "peak_time":             float(s["peak_time"])  if s.get("peak_time")  is not None else None,
            "end_time":              float(s["end_time"])   if s.get("end_time")   is not None else None,
            "predicted_stroke_type": s.get("predicted_stroke_type"),
        })
    # upsert with ignore-duplicates so re-running analysis is safe
    get_client().table("session_strokes").upsert(rows, on_conflict="session_id,stroke_index").execute()


def fetch_pending_session_ids(limit: int = 5) -> list[str]:
    res = (
        get_client()
        .table("swimming_sessions")
        .select("id")
        .eq("analysis_status", "pending")
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    rows = res.data or []
    return [r["id"] for r in rows]


def analyze_session(session_id: str) -> dict[str, Any]:
    from app.inference.run import run_inference_on_row

    set_analysis_status(session_id, "processing")
    try:
        row = fetch_session(session_id)
        result = run_inference_on_row(row)
        upsert_session_analysis(session_id, result)
        set_analysis_status(session_id, "completed")
        return {"session_id": session_id, "status": "completed", **result}
    except Exception as exc:
        set_analysis_status(session_id, "failed", str(exc))
        raise
