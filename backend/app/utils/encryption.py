from cryptography.fernet import Fernet
from app.config import settings


def get_fernet() -> Fernet:
    key = settings.DB_ENCRYPTION_KEY
    if len(key) < 32:
        import base64
        import hashlib
        key = base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest()).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_value(value: str) -> str:
    if not value:
        return ""
    f = get_fernet()
    return f.encrypt(value.encode()).decode()


def decrypt_value(encrypted_value: str) -> str:
    if not encrypted_value:
        return ""
    f = get_fernet()
    return f.decrypt(encrypted_value.encode()).decode()
