"""Poll Supabase for pending sessions and run analysis."""

from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path

# Allow running as: python -m app.worker.poll from ml-service/
ML_SERVICE_ROOT = Path(__file__).resolve().parents[2]
if str(ML_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_SERVICE_ROOT))

from dotenv import load_dotenv

load_dotenv(ML_SERVICE_ROOT.parent / ".env.local")
load_dotenv(ML_SERVICE_ROOT / ".env")

from app.config import POLL_BATCH_SIZE, POLL_INTERVAL_SEC
from app.db import analyze_session, fetch_pending_session_ids

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("ml-worker")


def run_once() -> int:
    ids = fetch_pending_session_ids(POLL_BATCH_SIZE)
    if not ids:
        return 0

    processed = 0
    for session_id in ids:
        log.info("Analyzing session %s", session_id)
        try:
            result = analyze_session(session_id)
            log.info(
                "Done %s: stroke=%s quality=%s score=%s",
                session_id,
                result.get("primary_stroke"),
                result.get("quality_tier"),
                result.get("quality_score"),
            )
            processed += 1
        except Exception:
            log.exception("Failed session %s", session_id)

    return processed


def main():
    log.info("ML worker started (interval=%ss, batch=%s)", POLL_INTERVAL_SEC, POLL_BATCH_SIZE)
    while True:
        try:
            n = run_once()
            if n:
                log.info("Processed %s session(s)", n)
        except Exception:
            log.exception("Worker loop error")
        time.sleep(POLL_INTERVAL_SEC)


if __name__ == "__main__":
    main()
