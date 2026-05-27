import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.database import get_db
from app.services.oauth_service import (
    PROVIDERS,
    get_authorization_url,
    validate_state_token,
    exchange_code_for_token,
    fetch_user_info,
    find_or_create_oauth_user,
)
from app.services.auth_service import generate_tokens, update_last_login

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/oauth", tags=["OAuth"])


@router.get("/{provider}")
async def oauth_initiate(provider: str):
    """Initiate OAuth flow - redirects browser to provider consent screen."""
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")

    url, _state = get_authorization_url(provider)
    return RedirectResponse(url=url, status_code=302)


@router.get("/callback/{provider}")
async def oauth_callback(
    provider: str,
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    db: Session = Depends(get_db),
):
    """Handle OAuth callback from provider."""
    frontend_login = f"{settings.FRONTEND_URL}/login"

    if provider not in PROVIDERS:
        return RedirectResponse(url=f"{frontend_login}?error=oauth_failed")

    # User denied authorization
    if error:
        logger.warning(f"OAuth {provider} denied: {error}")
        return RedirectResponse(url=f"{frontend_login}?error=oauth_denied")

    # Missing code or state
    if not code or not state:
        logger.warning(f"OAuth {provider} callback missing code or state")
        return RedirectResponse(url=f"{frontend_login}?error=oauth_failed")

    # Validate state (CSRF protection)
    if not validate_state_token(state):
        logger.warning(f"OAuth {provider} invalid state token")
        return RedirectResponse(url=f"{frontend_login}?error=oauth_failed")

    try:
        # Exchange code for tokens
        token_data = await exchange_code_for_token(provider, code)

        # Fetch user info from provider
        user_info = await fetch_user_info(provider, token_data)

        if not user_info.get("email"):
            logger.error(f"OAuth {provider}: no email in user info")
            return RedirectResponse(url=f"{frontend_login}?error=oauth_failed")

        # Find or create user in our database
        user = find_or_create_oauth_user(db, provider, user_info)

        if not user.is_active:
            return RedirectResponse(url=f"{frontend_login}?error=account_inactive")

        # Update last login timestamp
        update_last_login(db, user)

        # Generate JWT tokens (same as normal login)
        tokens = generate_tokens(user)

        # Redirect to frontend callback page with tokens
        callback_url = f"{settings.FRONTEND_URL}/auth/callback"
        params = urlencode({
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
        })
        return RedirectResponse(url=f"{callback_url}?{params}", status_code=302)

    except Exception as e:
        logger.exception(f"OAuth {provider} callback error: {e}")
        return RedirectResponse(url=f"{frontend_login}?error=oauth_failed")
