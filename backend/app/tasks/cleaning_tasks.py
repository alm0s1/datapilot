"""Cleaning pipeline Celery task - runs heavy cleaning operations in background.

Progress is tracked via Redis keys for frontend polling.
"""

import json
import os
import time
from typing import Any, Dict

import pandas as pd
import redis

from app.config import settings
from app.core.celery_app import celery_app
from app.services.cleaning_actions import execute_cleaning_plan


def _get_redis():
    """Get a synchronous Redis connection for progress tracking."""
    return redis.from_url(settings.REDIS_URL, decode_responses=True)


def _set_progress(r, job_id: str, pct: int, step: str, message: str = ""):
    """Update progress in Redis."""
    r.set(f"cleaning:{job_id}:status", "running")
    r.set(
        f"cleaning:{job_id}:progress",
        json.dumps({"pct": pct, "step": step, "message": message}),
    )
    r.expire(f"cleaning:{job_id}:status", 86400)
    r.expire(f"cleaning:{job_id}:progress", 86400)


@celery_app.task(bind=True, name="cleaning.run_pipeline")
def run_cleaning_pipeline(self, dataset_id: str, file_path: str, plan_actions: list):
    """Execute a cleaning plan as a background task.

    Args:
        dataset_id: UUID of the dataset.
        file_path: Path to the CSV/data file on disk.
        plan_actions: List of action dicts from CleaningPlan.actions.

    Stores results in Redis under cleaning:{task_id}:* keys.
    The API reads these keys to report status to the frontend.
    """
    job_id = self.request.id
    r = _get_redis()

    r.set(f"cleaning:{job_id}:status", "running")
    r.expire(f"cleaning:{job_id}:status", 86400)

    try:
        # Load the dataframe
        _set_progress(r, job_id, 0, "loading", "Loading dataset...")

        if not file_path or not os.path.exists(file_path):
            raise FileNotFoundError(f"Dataset file not found: {file_path}")

        # Prefer cleaned version if available
        cleaned_path = file_path + ".cleaned"
        if os.path.exists(cleaned_path):
            df = pd.read_csv(cleaned_path, low_memory=False)
        else:
            df = pd.read_csv(file_path, low_memory=False)

        _set_progress(r, job_id, 5, "loaded", f"Loaded {len(df)} rows, {len(df.columns)} columns")

        # Define progress callback
        def on_progress(pct: int, step: str):
            # Scale 5-95 for actions, reserve 0-5 for loading and 95-100 for saving
            scaled = 5 + int(pct * 0.9)
            _set_progress(r, job_id, scaled, step, f"Executing {step}...")

        # Execute the cleaning plan
        df, report = execute_cleaning_plan(df, plan_actions, progress_callback=on_progress)

        # Save cleaned file
        _set_progress(r, job_id, 95, "saving", "Saving cleaned data...")
        output_path = file_path + ".cleaned"
        df.to_csv(output_path, index=False)

        # Store report in Redis
        r.set(f"cleaning:{job_id}:status", "completed")
        r.set(f"cleaning:{job_id}:progress", json.dumps({"pct": 100, "step": "done", "message": "Cleaning complete"}))
        r.set(f"cleaning:{job_id}:report", json.dumps(report))
        r.set(f"cleaning:{job_id}:dataset_id", dataset_id)
        r.set(f"cleaning:{job_id}:rows_after", str(len(df)))
        r.set(f"cleaning:{job_id}:cols_after", str(len(df.columns)))

        # Expire all keys after 24h
        for suffix in ["status", "progress", "report", "dataset_id", "rows_after", "cols_after"]:
            r.expire(f"cleaning:{job_id}:{suffix}", 86400)

        return {"status": "completed", "dataset_id": dataset_id, "job_id": job_id}

    except Exception as e:
        r.set(f"cleaning:{job_id}:status", "failed")
        r.set(f"cleaning:{job_id}:error", str(e))
        r.expire(f"cleaning:{job_id}:status", 86400)
        r.expire(f"cleaning:{job_id}:error", 86400)
        raise
