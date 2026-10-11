import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from threading import RLock
from uuid import uuid4

import bcrypt
from jose import JWTError, jwt
from tinydb import Query, TinyDB

from ai_engineering_company_project_monorepo.api.settings import get_jwt_secret_key
from ai_engineering_company_project_monorepo.models.user import User
from ai_engineering_company_project_monorepo.services.user_service import get_user_by_id, update_user


reset_lock = RLock()


def record_password_reset_event(
    database: TinyDB, event: str, ip_address: str | None, *,
    email: str | None = None, user_id: str | None = None,
) -> None:
    with reset_lock:
        database.table("password_reset_audit").insert({
            "event": event,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "ip_address": ip_address,
            "email_hash": hashlib.sha256(email.encode("utf-8")).hexdigest() if email else None,
            "user_id": user_id,
        })


def accept_password_reset_request(database: TinyDB, email: str, ip_address: str | None) -> bool:
    email = email.strip().lower()
    limit = int(os.getenv("PASSWORD_RESET_REQUESTS_PER_HOUR", "3"))
    if limit <= 0:
        raise ValueError("PASSWORD_RESET_REQUESTS_PER_HOUR must be positive")
    email_hash = hashlib.sha256(email.encode("utf-8")).hexdigest()
    with reset_lock:
        now = datetime.now(timezone.utc).timestamp()
        table = database.table("password_reset_rate_limits")
        record = table.get(Query().email_hash == email_hash)
        timestamps = [timestamp for timestamp in record["timestamps"] if timestamp > now - 3600] if record else []
        allowed = len(timestamps) < limit
        if allowed:
            timestamps.append(now)
            table.upsert({"email_hash": email_hash, "timestamps": timestamps}, Query().email_hash == email_hash)
        record_password_reset_event(
            database, "request_accepted" if allowed else "request_rate_limited", ip_address, email=email,
        )
        return allowed


def get_reset_signing_key() -> str:
    return hmac.new(
        get_jwt_secret_key().encode("utf-8"), b"password-reset", hashlib.sha256
    ).hexdigest()


def create_password_reset_token(database: TinyDB, user: User) -> str:
    minutes = int(os.getenv("PASSWORD_RESET_EXPIRE_MINUTES", "30"))
    if not 15 <= minutes <= 60:
        raise ValueError("PASSWORD_RESET_EXPIRE_MINUTES must be between 15 and 60")
    token = jwt.encode(
        {
            "sub": user.id,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
            "jti": str(uuid4()),
            "purpose": "password-reset",
        },
        get_reset_signing_key(),
        algorithm="HS256",
    )
    with reset_lock:
        database.table("password_reset_tokens").upsert(
            {
                "user_id": user.id,
                "token_hash": hashlib.sha256(token.encode("utf-8")).hexdigest(),
                "password_hash": user.hashed_password,
            },
            Query().user_id == user.id,
        )
    return token


def change_password(
    database: TinyDB, user_id: str, current_password: str, new_password: str
) -> None:
    with reset_lock:
        user = get_user_by_id(database, user_id)
        valid_password = False
        if user is not None:
            try:
                valid_password = bcrypt.checkpw(
                    current_password.encode("utf-8"), user.hashed_password.encode("ascii")
                )
            except (ValueError, UnicodeEncodeError):
                valid_password = False
        if user is None or not valid_password:
            raise ValueError("Current password is incorrect")
        hashed_password = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")
        update_user(database, user.id, hashed_password=hashed_password)
        database.table("password_reset_tokens").remove(Query().user_id == user.id)


def reset_password(
    database: TinyDB, token: str, new_password: str, *, ip_address: str | None = None
) -> None:
    try:
        claims = jwt.decode(
            token,
            get_reset_signing_key(),
            algorithms=["HS256"],
            options={"require_exp": True, "require_sub": True, "require_jti": True},
        )
    except (JWTError, ValueError, TypeError) as error:
        raise ValueError("Invalid or expired reset token") from error
    if claims.get("purpose") != "password-reset":
        raise ValueError("Invalid reset token")

    with reset_lock:
        if float(claims["exp"]) <= datetime.now(timezone.utc).timestamp():
            raise ValueError("Expired reset token")
        table = database.table("password_reset_tokens")
        record = table.get(Query().user_id == claims["sub"])
        user = get_user_by_id(database, claims["sub"])
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        stored_hash = record.get("token_hash") if record is not None else None
        if (
            user is None
            or record is None
            or not isinstance(stored_hash, str)
            or not hmac.compare_digest(stored_hash, token_hash)
            or record.get("password_hash") != user.hashed_password
        ):
            raise ValueError("Invalid or already used reset token")
        hashed_password = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")
        if update_user(database, user.id, hashed_password=hashed_password) is None:
            raise ValueError("Invalid reset token")
        table.remove(doc_ids=[record.doc_id])
        record_password_reset_event(database, "reset_succeeded", ip_address, user_id=user.id)