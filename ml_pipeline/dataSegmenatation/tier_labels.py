"""
Canonical quality tier names for segmented stroke training and feature-extraction output.

Composite class labels look like: Butterfly_Low, Freestyle_Moderate_High, Breast_High.
"""

from __future__ import annotations

import re

# Folder / risk strings from analyzers and manual labels map to these four suffixes.
TIER_SUFFIXES = ("Low", "Moderate", "Moderate_High", "High")

# Canonical style segment folder names (match segment_strokes / training).
STYLE_FOLDER_NAMES = {
    "butterfly": "Butterfly",
    "freestyle": "Freestyle",
    "breast": "Breast",
}


def normalize_tier_token(name: str) -> str | None:
    """
    Map a folder or risk label to one of: Low, Moderate, Moderate_High, High.
    Returns None if no match.
    """
    if not name or not str(name).strip():
        return None
    s = str(name).strip()
    low = s.lower().replace("-", "_").replace(" ", "_")
    # typos
    low = low.replace("modrate", "moderate")
    # collapse repeated underscores
    low = re.sub(r"_+", "_", low)

    if low in ("moderate_high", "moderatehigh", "mod_high", "high_mod", "borderline"):
        return "Moderate_High"
    if "moderate" in low and "high" in low:
        return "Moderate_High"
    if low in ("low",):
        return "Low"
    if low in ("moderate", "medium", "mod"):
        return "Moderate"
    if low in ("high", "high_risk", "bad"):
        return "High"
    return None


def composite_class_name(style_folder_name: str, tier_raw: str) -> str | None:
    """e.g. Butterfly + Low -> Butterfly_Low"""
    tier = normalize_tier_token(tier_raw)
    if tier is None:
        return None
    style = style_folder_name.strip()
    if not style:
        return None
    return f"{style}_{tier}"


def is_gb_nested_layout(root) -> bool:
    """True if root/GB/<Butterfly|Freestyle|Breast>/<tier>/ exists."""
    from pathlib import Path

    r = Path(root)
    gb = r / "GB"
    if not gb.is_dir():
        return False
    for s in ("Butterfly", "Freestyle", "Breast"):
        p = gb / s
        if not p.is_dir():
            continue
        subs = [x for x in p.iterdir() if x.is_dir()]
        if not subs:
            continue
        if any(normalize_tier_token(x.name) for x in subs):
            return True
    return False
