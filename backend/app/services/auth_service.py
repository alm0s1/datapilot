from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token
from app.models.user import User, Role
from app.schemas.user import UserCreate


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.hashed_password:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def create_user(db: Session, user_data: UserCreate) -> User:
    hashed = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hashed,
        full_name=user_data.full_name,
        locale=user_data.locale,
    )
    # Assign default 'viewer' role if it exists
    viewer_role = db.query(Role).filter(Role.name == "viewer").first()
    if viewer_role:
        user.roles.append(viewer_role)

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def get_user_by_username(db: Session, username: str) -> User | None:
    return db.query(User).filter(User.username == username).first()


def generate_tokens(user: User) -> dict:
    access = create_access_token(data={"sub": str(user.id)})
    refresh = create_refresh_token(data={"sub": str(user.id)})
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}


def update_last_login(db: Session, user: User):
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
