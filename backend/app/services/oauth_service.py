import re
import secrets
from typing import Dict, Any, Optional
from urllib.parse import urlencode

import httpx
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User, Role


# ---------- Provider Configuration ----------

PROVIDERS = {
    "google": {
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://www.googleapis.com/oauth2/v3/userinfo",
        "scopes": "openid email profile",
    },
    "microsoft": {
        "authorize_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "userinfo_url": "https://graph.microsoft.com/v1.0/me",
        "scopes": "openid email profile User.Read",
    },
}


def _get_client_credentials(provider: str) -> tuple[str, str]:
    if provider == "google":
        return settings.OAUTH_GOOGLE_CLIENT_ID, settings.OAUTH_GOOGLE_CLIENT_SECRET
    elif provider == "microsoft":
        return settings.OAUTH_MICROSOFT_CLIENT_ID, settings.OAUTH_MICROSOFT_CLIENT_SECRET
    raise ValueError(f"Unsupported provider: {provider}")


def _get_redirect_uri(provider: str) -> str:
    base = settings.API_PREFIX
    return f"{settings.BACKEND_URL}{base}/auth/oauth/callback/{provider}"


# ---------- State Token (CSRF Protection) ----------

_serializer = URLSafeTimedSerializer(settings.SECRET_KEY, salt="oauth-state")


def generate_state_token() -> str:
    nonce = secrets.token_hex(16)
    return _serializer.dumps(nonce)


def validate_state_token(state: str) -> bool:
    try:
        _serializer.loads(state, max_age=300)  # 5 minutes
        return True
    except (BadSignature, SignatureExpired):
        return False


# ---------- Authorization URL ----------

def get_authorization_url(provider: str) -> tuple[str, str]:
    config = PROVIDERS[provider]
    client_id, _ = _get_client_credentials(provider)
    state = generate_state_token()

    params = {
        "client_id": client_id,
        "redirect_uri": _get_redirect_uri(provider),
        "response_type": "code",
        "scope": config["scopes"],
        "state": state,
    }

    if provider == "google":
        params["access_type"] = "offline"
        params["prompt"] = "select_account"
    elif provider == "microsoft":
        params["response_mode"] = "query"

    return f"{config['authorize_url']}?{urlencode(params)}", state


# ---------- Token Exchange ----------

async def exchange_code_for_token(provider: str, code: str) -> Dict[str, Any]:
    config = PROVIDERS[provider]
    client_id, client_secret = _get_client_credentials(provider)

    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": _get_redirect_uri(provider),
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(config["token_url"], data=data)
        resp.raise_for_status()
        return resp.json()


# ---------- Fetch User Info ----------

async def fetch_user_info(provider: str, token_data: Dict[str, Any]) -> Dict[str, Any]:
    access_token = token_data["access_token"]

    async with httpx.AsyncClient() as client:
        config = PROVIDERS[provider]
        headers = {"Authorization": f"Bearer {access_token}"}
        resp = await client.get(config["userinfo_url"], headers=headers)
        resp.raise_for_status()
        raw = resp.json()

    if provider == "google":
        return {
            "email": raw["email"],
            "email_verified": raw.get("email_verified", False),
            "full_name": raw.get("name"),
            "avatar_url": raw.get("picture"),
            "oauth_id": raw["sub"],
        }
    elif provider == "microsoft":
        # Microsoft Graph /me doesn't return avatar directly; use email as primary
        email = raw.get("mail") or raw.get("userPrincipalName", "")
        return {
            "email": email,
            "email_verified": True,  # Microsoft verifies emails
            "full_name": raw.get("displayName"),
            "avatar_url": None,
            "oauth_id": raw["id"],
        }

    raise ValueError(f"Unsupported provider: {provider}")


# ---------- Find or Create User ----------

def find_or_create_oauth_user(
    db: Session, provider: str, user_info: Dict[str, Any]
) -> User:
    email = user_info["email"]
    oauth_id = user_info["oauth_id"]

    # 1. Check by oauth_provider + oauth_id (returning OAuth user)
    user = (
        db.query(User)
        .filter(User.oauth_provider == provider, User.oauth_id == oauth_id)
        .first()
    )
    if user:
        # Update avatar if changed
        if user_info.get("avatar_url") and user.avatar_url != user_info["avatar_url"]:
            user.avatar_url = user_info["avatar_url"]
            db.commit()
        return user

    # 2. Check by email (existing email/password user)
    user = db.query(User).filter(User.email == email).first()
    if user:
        # Link OAuth provider to existing account
        user.oauth_provider = provider
        user.oauth_id = oauth_id
        user.email_verified = True
        if user_info.get("avatar_url"):
            user.avatar_url = user_info["avatar_url"]
        if not user.full_name and user_info.get("full_name"):
            user.full_name = user_info["full_name"]
        db.commit()
        db.refresh(user)
        return user

    # 3. Create new user
    username = _generate_username_from_email(db, email)
    user = User(
        email=email,
        username=username,
        hashed_password=None,
        full_name=user_info.get("full_name"),
        oauth_provider=provider,
        oauth_id=oauth_id,
        avatar_url=user_info.get("avatar_url"),
        email_verified=True,
        is_active=True,
    )

    # Assign default "viewer" role
    viewer_role = db.query(Role).filter(Role.name == "viewer").first()
    if viewer_role:
        user.roles.append(viewer_role)

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ---------- Username Generation ----------

def _generate_username_from_email(db: Session, email: str) -> str:
    prefix = email.split("@")[0]
    # Sanitize: keep alphanumeric, dots, underscores; lowercase
    prefix = re.sub(r"[^a-zA-Z0-9._]", "", prefix).lower()
    if not prefix:
        prefix = "user"
    prefix = prefix[:20]

    # Check uniqueness
    candidate = prefix
    for _ in range(20):
        existing = db.query(User).filter(User.username == candidate).first()
        if not existing:
            return candidate
        candidate = f"{prefix}_{secrets.token_hex(2)}"

    # Extremely unlikely fallback
    return f"user_{secrets.token_hex(4)}"
