"""AI-powered features API endpoints."""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.database_connection import DatabaseConnection
from app.models.user import User
from app.services.nl2sql_service import nl_to_sql


router = APIRouter(prefix="/ai", tags=["AI"])


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class NL2SQLRequest(BaseModel):
    connection_id: UUID
    question: str
    conversation_history: Optional[List[ChatMessage]] = None


class NL2SQLResponse(BaseModel):
    sql: str
    explanation: str
    confidence: float
    error: bool = False


@router.post("/nl2sql", response_model=NL2SQLResponse)
async def natural_language_to_sql(
    request: NL2SQLRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Convert natural language question to SQL query."""
    # Get the database connection
    connection = db.query(DatabaseConnection).filter(
        DatabaseConnection.id == request.connection_id
    ).first()
    
    if not connection:
        raise HTTPException(status_code=404, detail="Database connection not found")
    
    # Convert conversation history to the expected format
    history = None
    if request.conversation_history:
        history = [{"role": msg.role, "content": msg.content} for msg in request.conversation_history]
    
    result = await nl_to_sql(
        db=db,
        connection=connection,
        question=request.question,
        conversation_history=history,
    )
    
    return NL2SQLResponse(**result)
