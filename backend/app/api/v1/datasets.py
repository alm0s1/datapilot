import json
import os
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.dataset import Dataset, UploadStatus
from app.schemas.dataset import (
    DatasetResponse,
    DatasetListItem,
    DatasetUpdate,
    CleanRequest,
    AnalyzeRequest,
    PreviewResponse,
)
from app.schemas.cleaning import (
    CleaningSuggestion,
    CleanWithPlanRequest,
    CleaningJobResponse,
    CleaningReport,
    SuggestRequest,
)
from app.services import dataset_service
from app.services.data_analyzer import generate_rule_based_insights, ai_analyze

router = APIRouter(prefix="/datasets", tags=["Datasets"])


# ---------------------------------------------------------------------------
# Existing endpoints (unchanged)
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=DatasetResponse, status_code=201)
async def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a CSV/XLSX/XLS file to create a new dataset."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    allowed_extensions = (".csv", ".xlsx", ".xls")
    if not any(file.filename.lower().endswith(ext) for ext in allowed_extensions):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
        )

    try:
        dataset_name = name if name else file.filename.rsplit(".", 1)[0]
        dataset = await dataset_service.save_upload(
            file=file,
            filename=file.filename,
            name=dataset_name,
            user_id=str(current_user.id),
            db=db,
        )
        return dataset
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("", response_model=list[DatasetListItem])
def list_datasets(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all datasets for the current user."""
    query = db.query(Dataset).filter(
        Dataset.created_by_id == current_user.id,
        Dataset.is_archived == False,
    )
    if status:
        query = query.filter(Dataset.upload_status == status)
    datasets = query.order_by(Dataset.created_at.desc()).offset(skip).limit(limit).all()
    return datasets


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get dataset details."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.put("/{dataset_id}", response_model=DatasetResponse)
def update_dataset(
    dataset_id: UUID,
    data: DatasetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update dataset metadata."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if data.name is not None:
        dataset.name = data.name
    if data.description is not None:
        dataset.description = data.description
    db.commit()
    db.refresh(dataset)
    return dataset


@router.delete("/{dataset_id}")
def delete_dataset_endpoint(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete dataset, drop physical table, and remove virtual connection."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    try:
        dataset_service.delete_dataset(dataset, db)
        return {"message": "Dataset deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


@router.get("/{dataset_id}/preview")
def get_preview(
    dataset_id: UUID,
    cleaned: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get preview of uploaded data (first 100 rows + detected schema).
    
    Pass ?cleaned=true to preview the cleaned version after smart cleaning.
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    try:
        return dataset_service.get_preview(dataset, db, use_cleaned=cleaned)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Preview failed: {str(e)}")


@router.post("/{dataset_id}/clean")
def clean_dataset(
    dataset_id: UUID,
    request: CleanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply legacy cleaning configuration and return cleaned preview."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    try:
        config = request.cleaning_config.model_dump()
        return dataset_service.clean_data(dataset, config, db)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cleaning failed: {str(e)}")


@router.get("/{dataset_id}/profile")
def get_profile(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get or generate profiling statistics for the dataset."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Return cached profiling if available
    if dataset.profiling_results:
        return dataset.profiling_results

    try:
        return dataset_service.profile_dataset(dataset, db)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Profiling failed: {str(e)}")


@router.post("/{dataset_id}/store", response_model=DatasetResponse)
def store_dataset(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Store the cleaned dataset in the database and create a virtual connection."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if dataset.upload_status == UploadStatus.completed:
        raise HTTPException(status_code=400, detail="Dataset already stored")

    try:
        return dataset_service.store_dataset(dataset, str(current_user.id), db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Store failed: {str(e)}")


@router.post("/{dataset_id}/analyze")
async def analyze_dataset(
    dataset_id: UUID,
    request: AnalyzeRequest = AnalyzeRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate analysis insights and chart suggestions."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Ensure profiling is done first
    if not dataset.profiling_results:
        try:
            dataset_service.profile_dataset(dataset, db)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Profiling required first: {str(e)}")

    profiling = dataset.profiling_results

    # Rule-based analysis
    try:
        df = dataset_service._load_cleaned_or_raw(dataset)
    except Exception:
        df = None

    results = generate_rule_based_insights(profiling, df)

    # Optional AI analysis
    if request.use_ai:
        ai_results = await ai_analyze(profiling)
        # Merge AI insights with rule-based
        results["insights"] = results["insights"] + ai_results.get("insights", [])

    dataset.analysis_results = results
    db.commit()

    return results


# ---------------------------------------------------------------------------
# NEW: Advanced Cleaning Endpoints
# ---------------------------------------------------------------------------

@router.post("/{dataset_id}/suggest")
async def suggest_cleaning(
    dataset_id: UUID,
    body: SuggestRequest = SuggestRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate intelligent cleaning suggestions based on data profiling.

    Profiles the dataset first (if not cached), then analyzes each column
    to produce actionable suggestions with confidence scores.
    When use_ai=True, enhances suggestions with AI-powered analysis.
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    try:
        # Ensure profiling is done AND up-to-date (has semantic_type fields)
        needs_profiling = not dataset.profiling_results
        if not needs_profiling:
            cols = (dataset.profiling_results or {}).get("columns", {})
            if cols:
                first_col = next(iter(cols.values()))
                if "semantic_type" not in first_col:
                    needs_profiling = True
            else:
                needs_profiling = True
        if needs_profiling:
            dataset_service.profile_dataset(dataset, db)

        profiling = dataset.profiling_results
        df = dataset_service._load_cleaned_or_raw(dataset)

        from app.services.cleaning_suggestion_engine import generate_suggestions, merge_ai_suggestions
        suggestions = generate_suggestions(profiling, df)

        # AI enhancement when requested
        if body.use_ai:
            from app.services.ai_cleaning_advisor import ai_enhance_suggestions
            ai_result = await ai_enhance_suggestions(profiling, df, suggestions)
            if ai_result:
                total_rows = profiling.get("total_rows", len(df))
                suggestions = merge_ai_suggestions(suggestions, ai_result, total_rows)

        return [s.model_dump() for s in suggestions]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Suggestion generation failed: {str(e)}")


@router.post("/{dataset_id}/clean-with-plan")
def clean_with_plan(
    dataset_id: UUID,
    request: CleanWithPlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Execute an approved cleaning plan.

    Checks if any action requires heavy processing. If so, dispatches a Celery
    background task and returns a job_id for polling. Otherwise, runs
    synchronously and returns the report directly.
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    actions = [a.model_dump() for a in request.plan.actions if a.enabled]
    if not actions:
        raise HTTPException(status_code=400, detail="No enabled actions in cleaning plan")

    # Only dispatch to Celery for truly large datasets (>10k rows)
    # Small datasets run synchronously even with "heavy" actions
    row_count = dataset.row_count or 0
    use_async = row_count > 10000

    if use_async:
        # Dispatch Celery background task
        try:
            from app.tasks.cleaning_tasks import run_cleaning_pipeline
            result = run_cleaning_pipeline.delay(
                dataset_id=str(dataset.id),
                file_path=dataset.file_path,
                plan_actions=actions,
            )
            job_id = result.id

            # Update dataset
            dataset.upload_status = UploadStatus.cleaning
            dataset.cleaning_job_id = job_id
            db.commit()

            return {
                "job_id": job_id,
                "dataset_id": str(dataset.id),
                "status": "queued",
                "progress_pct": 0,
                "current_step": None,
                "report": None,
                "error": None,
            }
        except Exception as e:
            # Celery not available - fall through to sync execution
            pass

    # Synchronous execution
    try:
        dataset.upload_status = UploadStatus.cleaning
        db.commit()

        df = dataset_service._load_cleaned_or_raw(dataset)
        from app.services.cleaning_actions import execute_cleaning_plan
        df, report = execute_cleaning_plan(
            df, actions, profiling_results=dataset.profiling_results,
        )

        # Save cleaned file
        cleaned_path = dataset.file_path + ".cleaned"
        df.to_csv(cleaned_path, index=False)

        # Update dataset
        dataset.row_count = len(df)
        dataset.column_count = len(df.columns)
        dataset.cleaning_report = report
        dataset.cleaning_config = {"plan_actions": actions}
        # Invalidate cached profiling & analysis so they re-run on cleaned data
        dataset.profiling_results = None
        dataset.analysis_results = None
        db.commit()

        return {
            "job_id": "sync",
            "dataset_id": str(dataset.id),
            "status": "completed",
            "progress_pct": 100,
            "current_step": "done",
            "report": report,
            "error": None,
        }
    except Exception as e:
        dataset.upload_status = UploadStatus.failed
        dataset.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Cleaning failed: {str(e)}")


@router.get("/{dataset_id}/clean/status/{job_id}")
def get_cleaning_status(
    dataset_id: UUID,
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll the status of an async cleaning job."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    import redis as redis_lib
    from app.config import settings
    r = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)

    status = r.get(f"cleaning:{job_id}:status") or "queued"
    progress_raw = r.get(f"cleaning:{job_id}:progress")
    report_raw = r.get(f"cleaning:{job_id}:report")
    error = r.get(f"cleaning:{job_id}:error")

    progress = json.loads(progress_raw) if progress_raw else {"pct": 0, "step": None, "message": ""}
    report = json.loads(report_raw) if report_raw else None

    # If completed, update dataset record
    if status == "completed" and report and not dataset.cleaning_report:
        rows_after = r.get(f"cleaning:{job_id}:rows_after")
        cols_after = r.get(f"cleaning:{job_id}:cols_after")
        dataset.cleaning_report = report
        if rows_after:
            dataset.row_count = int(rows_after)
        if cols_after:
            dataset.column_count = int(cols_after)
        db.commit()

    return {
        "job_id": job_id,
        "dataset_id": str(dataset.id),
        "status": status,
        "progress_pct": progress.get("pct", 0),
        "current_step": progress.get("step"),
        "report": report,
        "error": error,
    }


@router.get("/{dataset_id}/report")
def get_cleaning_report(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the cleaning report for a dataset."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if not dataset.cleaning_report:
        raise HTTPException(status_code=404, detail="No cleaning report available")

    return dataset.cleaning_report


@router.get("/{dataset_id}/download-cleaned")
def download_cleaned_file(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download the cleaned version of the dataset as CSV."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    cleaned_path = (dataset.file_path or "") + ".cleaned"
    if not os.path.exists(cleaned_path):
        raise HTTPException(status_code=404, detail="No cleaned file available")

    filename = dataset.original_filename or "dataset.csv"
    name, _ = os.path.splitext(filename)
    download_name = f"{name}_cleaned.csv"

    return FileResponse(
        path=cleaned_path,
        media_type="text/csv",
        filename=download_name,
    )


@router.get("/{dataset_id}/download-report")
def download_cleaning_report(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download the cleaning report as JSON."""
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if not dataset.cleaning_report:
        raise HTTPException(status_code=404, detail="No cleaning report available")

    import tempfile
    report_json = json.dumps(dataset.cleaning_report, indent=2, default=str)

    filename = dataset.original_filename or "dataset"
    name, _ = os.path.splitext(filename)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json", mode="w")
    tmp.write(report_json)
    tmp.close()

    return FileResponse(
        path=tmp.name,
        media_type="application/json",
        filename=f"{name}_cleaning_report.json",
    )
