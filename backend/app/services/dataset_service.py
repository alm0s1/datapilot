"""Dataset service - upload, parse, clean, profile, store datasets."""

import os
import uuid
import shutil
from typing import Any, Dict, List, Optional

import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.core.database import engine as app_engine
from app.models.dataset import Dataset, FileType, UploadStatus
from app.models.database_connection import DatabaseConnection, DatabaseType
from app.services.data_profiler import profile_dataframe
from app.utils.json_serializer import to_native, rows_to_json_safe, sanitize_profile


def _ensure_upload_dir() -> str:
    """Ensure the upload directory exists."""
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    return settings.UPLOAD_DIR


def _generate_table_name() -> str:
    """Generate a unique table name for a dataset."""
    short_id = uuid.uuid4().hex[:12]
    return f"{settings.DATASET_TABLE_PREFIX}{short_id}"


def _detect_file_type(filename: str) -> FileType:
    """Detect file type from filename extension."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "csv":
        return FileType.csv
    elif ext == "xlsx":
        return FileType.xlsx
    elif ext == "xls":
        return FileType.xls
    else:
        raise ValueError(f"Unsupported file type: .{ext}. Supported: csv, xlsx, xls")


async def save_upload(file, filename: str, name: str, user_id: str, db: Session) -> Dataset:
    """Save uploaded file and create Dataset record."""
    upload_dir = _ensure_upload_dir()
    file_type = _detect_file_type(filename)

    # Generate unique file path
    file_id = uuid.uuid4().hex[:16]
    safe_name = f"{file_id}_{filename}"
    file_path = os.path.join(upload_dir, safe_name)

    # Stream file to disk
    content = await file.read()
    file_size = len(content)

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_bytes:
        raise ValueError(f"File too large ({file_size} bytes). Maximum: {settings.MAX_UPLOAD_SIZE_MB} MB")

    with open(file_path, "wb") as f:
        f.write(content)

    # Create dataset record
    dataset = Dataset(
        name=name or filename,
        original_filename=filename,
        file_type=file_type,
        file_size_bytes=file_size,
        table_name=_generate_table_name(),
        upload_status=UploadStatus.parsing,
        file_path=file_path,
        created_by_id=user_id,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return dataset


def read_file_to_dataframe(dataset: Dataset) -> pd.DataFrame:
    """Read the uploaded file into a pandas DataFrame."""
    if not dataset.file_path or not os.path.exists(dataset.file_path):
        raise ValueError("File not found on disk")

    if dataset.file_type == FileType.csv:
        df = pd.read_csv(dataset.file_path, low_memory=False, encoding_errors="replace")
    elif dataset.file_type in (FileType.xlsx, FileType.xls):
        df = pd.read_excel(dataset.file_path, engine="openpyxl" if dataset.file_type == FileType.xlsx else None)
    else:
        raise ValueError(f"Unsupported file type: {dataset.file_type}")

    # Strip BOM and invisible characters from column names
    df.columns = [str(c).replace("\ufeff", "").strip() for c in df.columns]

    return df


def get_preview(dataset: Dataset, db: Session, use_cleaned: bool = False) -> Dict[str, Any]:
    """Get a preview of the uploaded file (first 100 rows + schema).
    
    If use_cleaned=True, loads the cleaned version if available.
    """
    try:
        dataset.upload_status = UploadStatus.parsing
        db.commit()

        df = _load_cleaned_or_raw(dataset) if use_cleaned else read_file_to_dataframe(dataset)

        # Detect column types
        columns = []
        for col_name in df.columns:
            dtype = str(df[col_name].dtype)
            # Try to provide a friendlier type name
            if "int" in dtype:
                detected = "integer"
            elif "float" in dtype:
                detected = "decimal"
            elif "datetime" in dtype:
                detected = "datetime"
            elif "bool" in dtype:
                detected = "boolean"
            else:
                # Check if it looks like dates
                sample = df[col_name].dropna().head(20)
                if len(sample) > 0:
                    try:
                        pd.to_datetime(sample)
                        detected = "datetime (detected)"
                    except (ValueError, TypeError):
                        try:
                            pd.to_numeric(sample)
                            detected = "numeric (detected)"
                        except (ValueError, TypeError):
                            detected = "text"
                else:
                    detected = "text"
            columns.append({"name": str(col_name), "detected_type": detected})

        # Get sample rows
        rows = rows_to_json_safe(df, limit=100)

        # Update dataset metadata
        dataset.row_count = len(df)
        dataset.column_count = len(df.columns)
        db.commit()

        return {
            "columns": columns,
            "rows": rows,
            "total_rows": len(df),
        }
    except Exception as e:
        dataset.upload_status = UploadStatus.failed
        dataset.error_message = str(e)
        db.commit()
        raise


def clean_data(dataset: Dataset, cleaning_config: Dict[str, Any], db: Session) -> Dict[str, Any]:
    """Apply cleaning transformations and return preview of cleaned data."""
    try:
        dataset.upload_status = UploadStatus.cleaning
        dataset.cleaning_config = cleaning_config
        db.commit()

        df = read_file_to_dataframe(dataset)
        original_rows = len(df)

        # Trim whitespace
        if cleaning_config.get("trim_whitespace", True):
            for col in df.select_dtypes(include=["object"]).columns:
                df[col] = df[col].map(lambda x: x.strip() if isinstance(x, str) else x)

        # Normalize types
        if cleaning_config.get("normalize_types", True):
            df = _normalize_types(df)

        # Remove duplicates
        if cleaning_config.get("remove_duplicates", True):
            df = df.drop_duplicates()

        # Handle nulls
        null_strategy = cleaning_config.get("handle_nulls", "none")
        if null_strategy == "drop_rows":
            df = df.dropna()
        elif null_strategy == "fill_empty":
            for col in df.columns:
                if pd.api.types.is_numeric_dtype(df[col]):
                    df[col] = df[col].fillna(0)
                else:
                    df[col] = df[col].fillna("")
        elif null_strategy == "forward_fill":
            df = df.ffill()

        cleaned_rows = len(df)

        # Save cleaned file
        cleaned_path = dataset.file_path + ".cleaned"
        if dataset.file_type == FileType.csv:
            df.to_csv(cleaned_path, index=False)
        else:
            df.to_csv(cleaned_path, index=False)  # Save as CSV for cleaned version

        dataset.row_count = cleaned_rows
        dataset.column_count = len(df.columns)
        # Invalidate cached profiling & analysis so they re-run on cleaned data
        dataset.profiling_results = None
        dataset.analysis_results = None
        db.commit()

        # Return preview
        rows = rows_to_json_safe(df, limit=100)

        columns = [{"name": str(col), "detected_type": str(df[col].dtype)} for col in df.columns]

        return {
            "columns": columns,
            "rows": rows,
            "total_rows": cleaned_rows,
            "rows_removed": original_rows - cleaned_rows,
        }
    except Exception as e:
        dataset.upload_status = UploadStatus.failed
        dataset.error_message = str(e)
        db.commit()
        raise


def profile_dataset(dataset: Dataset, db: Session) -> Dict[str, Any]:
    """Generate profiling statistics for the dataset."""
    try:
        dataset.upload_status = UploadStatus.profiling
        db.commit()

        df = _load_cleaned_or_raw(dataset)
        results = profile_dataframe(df)

        dataset.profiling_results = sanitize_profile(results)
        db.commit()

        return results
    except Exception as e:
        dataset.upload_status = UploadStatus.failed
        dataset.error_message = str(e)
        db.commit()
        raise


def store_dataset(dataset: Dataset, user_id: str, db: Session) -> Dataset:
    """Store the cleaned dataset as a table in the app database and create a virtual connection."""
    try:
        dataset.upload_status = UploadStatus.storing
        db.commit()

        df = _load_cleaned_or_raw(dataset)

        # Normalize types before storing
        df = _normalize_types(df)

        # Clean column names for SQL compatibility
        df.columns = [_sanitize_column_name(col) for col in df.columns]

        # Store as SQL table
        table_name = dataset.table_name
        df.to_sql(table_name, app_engine, if_exists="replace", index=False)

        # Create virtual DatabaseConnection
        virtual_conn = DatabaseConnection(
            name=f"{dataset.name} (Dataset)",
            type=DatabaseType.dataset,
            database_name=table_name,  # Store table_name in database_name field
            is_active=True,
            created_by_id=user_id,
        )
        db.add(virtual_conn)
        db.flush()

        # Update dataset
        dataset.connection_id = virtual_conn.id
        dataset.row_count = len(df)
        dataset.column_count = len(df.columns)
        dataset.upload_status = UploadStatus.completed
        dataset.error_message = None
        db.commit()
        db.refresh(dataset)

        return dataset
    except Exception as e:
        dataset.upload_status = UploadStatus.failed
        dataset.error_message = str(e)
        db.commit()
        raise


def delete_dataset(dataset: Dataset, db: Session) -> None:
    """Delete dataset: drop physical table, remove connection, delete record."""
    # Drop physical table if it exists
    if dataset.table_name:
        try:
            with app_engine.connect() as conn:
                conn.execute(text(f'DROP TABLE IF EXISTS "{dataset.table_name}"'))
                conn.commit()
        except Exception:
            pass

    # Delete virtual connection
    if dataset.connection_id:
        connection = db.query(DatabaseConnection).filter(
            DatabaseConnection.id == dataset.connection_id
        ).first()
        if connection:
            db.delete(connection)

    # Clean up files
    if dataset.file_path and os.path.exists(dataset.file_path):
        try:
            os.remove(dataset.file_path)
        except Exception:
            pass
    cleaned_path = (dataset.file_path or "") + ".cleaned"
    if os.path.exists(cleaned_path):
        try:
            os.remove(cleaned_path)
        except Exception:
            pass

    db.delete(dataset)
    db.commit()


def _load_cleaned_or_raw(dataset: Dataset) -> pd.DataFrame:
    """Load cleaned version if available, otherwise raw."""
    cleaned_path = (dataset.file_path or "") + ".cleaned"
    if os.path.exists(cleaned_path):
        df = pd.read_csv(cleaned_path, low_memory=False)
        df.columns = [str(c).replace("\ufeff", "").strip() for c in df.columns]
        return df
    return read_file_to_dataframe(dataset)


def _normalize_types(df: pd.DataFrame) -> pd.DataFrame:
    """Attempt to convert columns to their best types."""
    for col in df.columns:
        if df[col].dtype == object:
            # Try datetime
            try:
                converted = pd.to_datetime(df[col], infer_datetime_format=True)
                if converted.notna().sum() > len(df) * 0.5:
                    df[col] = converted
                    continue
            except (ValueError, TypeError):
                pass

            # Try numeric
            try:
                converted = pd.to_numeric(df[col])
                if converted.notna().sum() > len(df) * 0.5:
                    df[col] = converted
                    continue
            except (ValueError, TypeError):
                pass

    return df


def _sanitize_column_name(name: str) -> str:
    """Sanitize column name for SQL compatibility."""
    import re
    name = str(name).strip()
    name = re.sub(r'[^\w]', '_', name)
    name = re.sub(r'_+', '_', name)
    name = name.strip('_')
    if not name or name[0].isdigit():
        name = f"col_{name}"
    return name.lower()



