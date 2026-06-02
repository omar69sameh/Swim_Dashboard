import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ML_PIPELINE_ROOT = Path(os.environ.get("ML_PIPELINE_ROOT", REPO_ROOT / "ml_pipeline"))

MODEL_FILES = {
    "model": "best_model_segmented.pth",
    "scaler": "scaler_segmented.pkl",
    "label_mapping": "label_mapping_segmented.pkl",
    "hyperparameters": "hyperparameters_segmented.pkl",
}

PIPELINE_VERSION = "segmented-v1"
POLL_INTERVAL_SEC = int(os.environ.get("ML_POLL_INTERVAL_SEC", "30"))
POLL_BATCH_SIZE = int(os.environ.get("ML_POLL_BATCH_SIZE", "5"))
ML_SERVICE_HOST = os.environ.get("ML_SERVICE_HOST", "0.0.0.0")
ML_SERVICE_PORT = int(os.environ.get("ML_SERVICE_PORT", "8000"))


def get_supabase_url() -> str:
    url = os.environ.get("SUPABASE_URL", "")
    if not url:
        raise ValueError("SUPABASE_URL is required")
    return url.rstrip("/")


def get_supabase_service_key() -> str:
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key:
        raise ValueError("SUPABASE_SERVICE_ROLE_KEY is required")
    return key


def model_paths() -> dict[str, Path]:
    root = ML_PIPELINE_ROOT
    paths = {k: root / v for k, v in MODEL_FILES.items()}
    missing = [str(p) for p in paths.values() if not p.exists()]
    if missing:
        raise FileNotFoundError(f"Missing model artifacts: {missing}")
    return paths
