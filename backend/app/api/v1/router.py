from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.oauth import router as oauth_router
from app.api.v1.users import router as users_router
from app.api.v1.connections import router as connections_router
from app.api.v1.queries import router as queries_router
from app.api.v1.dashboards import router as dashboards_router
from app.api.v1.collections import router as collections_router
from app.api.v1.datasets import router as datasets_router
from app.api.v1.ai import router as ai_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(oauth_router)
api_router.include_router(users_router)
api_router.include_router(connections_router)
api_router.include_router(queries_router)
api_router.include_router(dashboards_router)
api_router.include_router(collections_router)
api_router.include_router(datasets_router)
api_router.include_router(ai_router)
