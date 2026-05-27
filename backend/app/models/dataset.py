import uuid
import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    BigInteger,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.core.types import GUID, JSONType


class FileType(str, enum.Enum):
    csv = "csv"
    xlsx = "xlsx"
    xls = "xls"


class UploadStatus(str, enum.Enum):
    uploading = "uploading"
    parsing = "parsing"
    cleaning = "cleaning"
    profiling = "profiling"
    storing = "storing"
    completed = "completed"
    failed = "failed"


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    original_filename = Column(String(500), nullable=False)
    file_type = Column(Enum(FileType), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=True)
    table_name = Column(String(255), nullable=True, unique=True)
    connection_id = Column(GUID(), ForeignKey("database_connections.id", ondelete="SET NULL"), nullable=True)
    row_count = Column(Integer, nullable=True)
    column_count = Column(Integer, nullable=True)
    upload_status = Column(Enum(UploadStatus), default=UploadStatus.uploading, nullable=False)
    error_message = Column(Text, nullable=True)
    cleaning_config = Column(JSONType(), nullable=True)
    profiling_results = Column(JSONType(), nullable=True)
    analysis_results = Column(JSONType(), nullable=True)
    cleaning_report = Column(JSONType(), nullable=True)
    cleaning_job_id = Column(String(255), nullable=True)
    file_path = Column(Text, nullable=True)
    created_by_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)

    created_by = relationship("User", backref="datasets")
    connection = relationship("DatabaseConnection", backref="dataset")
