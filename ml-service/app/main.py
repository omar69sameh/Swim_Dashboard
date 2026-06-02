"""FastAPI entry: health + analyze endpoints."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.config import PIPELINE_VERSION, model_paths
from app.db import analyze_session

app = FastAPI(title="SwimML Analysis Service", version=PIPELINE_VERSION)


class AnalyzeResponse(BaseModel):
    session_id: str
    status: str
    primary_stroke: str
    quality_score: int
    quality_tier: str | None = None
    quality_label: str | None = None


@app.get("/health")
def health():
    try:
        model_paths()
        return {"ok": True, "pipeline_version": PIPELINE_VERSION}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.post("/analyze/{session_id}", response_model=AnalyzeResponse)
def analyze(session_id: str):
    try:
        result = analyze_session(session_id)
        return AnalyzeResponse(
            session_id=session_id,
            status=result["status"],
            primary_stroke=result["primary_stroke"],
            quality_score=result["quality_score"],
            quality_tier=result.get("quality_tier"),
            quality_label=result.get("quality_label"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
