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
