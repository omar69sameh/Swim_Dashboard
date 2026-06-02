"""Map pipeline outputs to dashboard-friendly stroke names and 0-100 scores."""

from __future__ import annotations

import re
from typing import Any

STROKE_MAP = {
    "freestyle": "Freestyle",
    "butterfly": "Butterfly",
    "breast": "Breaststroke",
    "breaststroke": "Breaststroke",
    "backstroke": "Backstroke",
    "im": "IM",
}

TIER_SCORES: dict[str, int] = {
    "low": 85,
    "moderate": 70,
    "moderate_high": 55,
    "high": 40,
    "bad": 40,
    "risk": 35,
    "good": 80,
}


def normalize_stroke(value: str | None, fallback_segmentation_style: str | None = None) -> str:
    if not value and fallback_segmentation_style:
        value = fallback_segmentation_style
    if not value:
        return "Freestyle"

    raw = str(value).strip()
    lower = raw.lower().replace("-", "_").replace(" ", "_")

    for key, mapped in STROKE_MAP.items():
        if lower.startswith(key) or f"_{key}_" in f"_{lower}_" or lower.endswith(f"_{key}"):
            return mapped

    if fallback_segmentation_style:
        return normalize_stroke(fallback_segmentation_style, None)

    return "Freestyle"


def extract_quality_tier(label: str | None, overall_tier: str | None = None) -> str:
    if overall_tier:
        return str(overall_tier).strip().lower().replace("-", "_").replace(" ", "_")
    if not label:
        return ""
    s = str(label).strip().lower().replace("-", "_").replace(" ", "_")
    for tier in ("moderate_high", "moderate", "low", "high", "good", "bad", "risk"):
        if tier in s:
            return tier
    return s


def tier_to_quality_score(tier: str | None, quality_label: str | None = None) -> int:
    if tier:
        t = tier.lower().replace("-", "_").replace(" ", "_")
        if t in TIER_SCORES:
            return TIER_SCORES[t]
    if quality_label:
        ql = str(quality_label).strip().lower()
        if ql == "good":
            return TIER_SCORES["good"]
        if ql == "bad":
            return TIER_SCORES["bad"]
    return 60


def build_ml_features(
    primary_stroke: str,
    quality_score: int,
    quality_tier: str,
    quality_label: str | None,
    num_strokes: int,
) -> list[dict[str, Any]]:
    tier_display = quality_tier.replace("_", " ").title() if quality_tier else "Unknown"
    label_display = quality_label or "N/A"

    def cat(score: int) -> str:
        if score >= 75:
            return "good"
        if score >= 50:
            return "average"
        return "needs_improvement"

    category = cat(quality_score)

    return [
        {
            "name": "Overall quality",
            "value": float(quality_score),
            "category": category,
            "weight": 1.0,
        },
        {
            "name": f"{primary_stroke} stroke type",
            "value": float(quality_score),
            "category": category,
            "weight": 0.9,
        },
        {
            "name": f"Quality tier ({tier_display})",
            "value": float(quality_score),
            "category": category,
            "weight": 0.7,
            "unit": label_display,
        },
        {
            "name": "Strokes analyzed",
            "value": min(100.0, float(num_strokes) * 10.0),
            "category": "good" if num_strokes >= 3 else "average",
            "weight": 0.3,
            "unit": str(num_strokes),
        },
    ]


def session_row_to_result(session_row: dict[str, Any], stroke_rows: list[dict[str, Any]]) -> dict[str, Any]:
    seg_style = session_row.get("segmentation_style")
    primary_stroke = normalize_stroke(
        session_row.get("overall_predicted_stroke_type"),
        seg_style,
    )
    if seg_style and primary_stroke == "Freestyle":
        primary_stroke = normalize_stroke(seg_style, None)

    quality_tier = extract_quality_tier(
        session_row.get("overall_predicted_stroke_type"),
        session_row.get("overall_quality_tier"),
    )
    quality_label = session_row.get("overall_predicted_quality")
    quality_score = tier_to_quality_score(quality_tier, quality_label)
    confidence = float(session_row.get("overall_confidence") or 0.0)
    num_strokes = int(session_row.get("num_strokes") or len(stroke_rows))

    segments = []
    for i, row in enumerate(stroke_rows):
        st = normalize_stroke(row.get("predicted_stroke_type"), row.get("segmentation_style"))
        segments.append(
            {
                "startIndex": i,
                "endIndex": i + 1,
                "strokeType": st,
                "confidence": float(row.get("confidence") or 0.0),
            }
        )

    return {
        "primary_stroke": primary_stroke,
        "stroke_confidence": confidence,
        "quality_tier": quality_tier,
        "quality_label": quality_label,
        "quality_score": quality_score,
        "num_strokes": num_strokes,
        "strokes_json": stroke_rows,
        "segments": segments,
        "features": build_ml_features(
            primary_stroke, quality_score, quality_tier, quality_label, num_strokes
        ),
    }
