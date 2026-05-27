"""Natural Language to SQL service using OpenAI or Ollama."""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.models.database_connection import DatabaseConnection
from app.services.connection_service import get_schema, get_table_columns


async def get_schema_context(db: Session, connection: DatabaseConnection) -> str:
    """Build schema context string for the AI prompt."""
    try:
        tables = get_schema(connection)
        schema_parts = []
        
        for table in tables[:20]:  # Limit to 20 tables to avoid token limits
            table_name = table.get("name", "")
            columns = get_table_columns(connection, table_name)
            
            col_defs = []
            for col in columns:
                col_name = col.get("name", "")
                col_type = col.get("type", "unknown")
                nullable = "NULL" if col.get("nullable", True) else "NOT NULL"
                col_defs.append(f"  {col_name} {col_type} {nullable}")
            
            schema_parts.append(f"CREATE TABLE {table_name} (\n" + ",\n".join(col_defs) + "\n);")
        
        return "\n\n".join(schema_parts)
    except Exception as e:
        return f"-- Schema fetch error: {str(e)}"


def build_system_prompt(db_type: str, schema_context: str) -> str:
    """Build the system prompt for NL2SQL."""
    return f"""You are a SQL expert assistant. Convert natural language questions to SQL queries.

Database type: {db_type}

Database schema:
{schema_context}

Rules:
1. Generate ONLY valid {db_type} SQL syntax
2. Always use table and column names exactly as shown in the schema
3. Use appropriate JOINs when querying related tables
4. Include LIMIT clause for SELECT queries (default LIMIT 100)
5. Never generate DROP, DELETE, TRUNCATE, or UPDATE statements unless explicitly asked
6. If the question is ambiguous, make reasonable assumptions and explain them
7. For aggregations, include appropriate GROUP BY clauses

Respond with a JSON object containing:
- "sql": the generated SQL query
- "explanation": brief explanation of what the query does
- "confidence": confidence score from 0.0 to 1.0"""


async def nl_to_sql(
    db: Session,
    connection: DatabaseConnection,
    question: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """Convert natural language question to SQL query."""
    
    schema_context = await get_schema_context(db, connection)
    system_prompt = build_system_prompt(connection.type, schema_context)
    
    messages = [{"role": "system", "content": system_prompt}]
    
    # Add conversation history for context
    if conversation_history:
        for msg in conversation_history[-6:]:  # Last 3 exchanges
            messages.append(msg)
    
    messages.append({"role": "user", "content": question})
    
    try:
        if settings.AI_PROVIDER == "openai" and settings.OPENAI_API_KEY:
            return await _call_openai(messages)
        elif settings.AI_PROVIDER == "ollama":
            return await _call_ollama(messages)
        else:
            return {
                "sql": "",
                "explanation": "AI not configured. Set OPENAI_API_KEY or configure Ollama.",
                "confidence": 0.0,
                "error": True,
            }
    except Exception as e:
        return {
            "sql": "",
            "explanation": f"Error generating SQL: {str(e)}",
            "confidence": 0.0,
            "error": True,
        }


async def _call_openai(messages: List[Dict[str, str]]) -> Dict[str, Any]:
    """Call OpenAI API for NL2SQL."""
    import openai
    import json
    import re
    
    client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
    
    response = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=messages,
        max_tokens=1000,
        temperature=0.1,  # Low temperature for consistent SQL generation
    )
    
    content = response.choices[0].message.content or ""
    
    # Try to parse as JSON first
    try:
        result = json.loads(content)
        return {
            "sql": result.get("sql", ""),
            "explanation": result.get("explanation", ""),
            "confidence": float(result.get("confidence", 0.7)),
            "error": False,
        }
    except json.JSONDecodeError:
        pass
    
    # Try to extract JSON from markdown code block
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', content, re.DOTALL)
    if json_match:
        try:
            result = json.loads(json_match.group(1))
            return {
                "sql": result.get("sql", ""),
                "explanation": result.get("explanation", ""),
                "confidence": float(result.get("confidence", 0.7)),
                "error": False,
            }
        except json.JSONDecodeError:
            pass
    
    # Try to extract SQL from markdown code block
    sql_match = re.search(r'```(?:sql)?\s*(SELECT.*?)\s*```', content, re.DOTALL | re.IGNORECASE)
    if sql_match:
        return {
            "sql": sql_match.group(1).strip(),
            "explanation": "Generated SQL query",
            "confidence": 0.6,
            "error": False,
        }
    
    # If content looks like SQL, return it directly
    if content.strip().upper().startswith(('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH')):
        return {
            "sql": content.strip(),
            "explanation": "Generated SQL query",
            "confidence": 0.6,
            "error": False,
        }
    
    # Last resort: return the content as explanation
    return {
        "sql": "",
        "explanation": content,
        "confidence": 0.3,
        "error": True,
    }


async def _call_ollama(messages: List[Dict[str, str]]) -> Dict[str, Any]:
    """Call Ollama API for NL2SQL."""
    import httpx
    import json
    
    # Convert messages to Ollama format
    prompt_parts = []
    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        if role == "system":
            prompt_parts.append(f"System: {content}")
        elif role == "user":
            prompt_parts.append(f"User: {content}")
        elif role == "assistant":
            prompt_parts.append(f"Assistant: {content}")
    
    prompt = "\n\n".join(prompt_parts) + "\n\nAssistant:"
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.OLLAMA_BASE_URL}/api/generate",
            json={
                "model": settings.OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "format": "json",
            },
            timeout=60,
        )
        
        data = resp.json()
        content = data.get("response", "")
        
        try:
            result = json.loads(content)
            return {
                "sql": result.get("sql", ""),
                "explanation": result.get("explanation", ""),
                "confidence": float(result.get("confidence", 0.5)),
                "error": False,
            }
        except json.JSONDecodeError:
            return {
                "sql": content,
                "explanation": "Generated SQL (parsing error)",
                "confidence": 0.3,
                "error": False,
            }
