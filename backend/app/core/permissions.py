from functools import wraps
from typing import List

from fastapi import HTTPException, status
from sqlalchemy.orm import Session


def require_permission(*permissions: str):
    """Decorator to check if user has required permissions."""

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            current_user = kwargs.get("current_user")
            if current_user is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required",
                )
            if current_user.is_superuser:
                return await func(*args, **kwargs)

            user_permissions = set()
            for role in current_user.roles:
                for perm in role.permissions:
                    user_permissions.add(perm.name)

            for perm in permissions:
                if perm not in user_permissions:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Permission '{perm}' required",
                    )
            return await func(*args, **kwargs)

        return wrapper

    return decorator


def check_resource_permission(
    db: Session,
    user,
    resource_type: str,
    resource_id: str,
    required_level: str = "viewer",
) -> bool:
    """Check if user has permission to access a specific resource."""
    from app.models.collaboration import ResourcePermission

    if user.is_superuser:
        return True

    level_hierarchy = {"viewer": 0, "editor": 1, "owner": 2}
    required = level_hierarchy.get(required_level, 0)

    permission = (
        db.query(ResourcePermission)
        .filter(
            ResourcePermission.resource_type == resource_type,
            ResourcePermission.resource_id == resource_id,
            ResourcePermission.user_id == user.id,
        )
        .first()
    )

    if permission:
        user_level = level_hierarchy.get(permission.permission_level, 0)
        return user_level >= required

    return False
