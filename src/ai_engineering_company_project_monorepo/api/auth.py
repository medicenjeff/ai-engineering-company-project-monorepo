import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from jose import jwt
from tinydb import TinyDB

from ai_engineering_company_project_monorepo.api.dependencies import get_current_user, get_database
from ai_engineering_company_project_monorepo.api.schemas import (
    AccessTokenResponse,
    AuthMeResponse,
    AuthProfileResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
)
from ai_engineering_company_project_monorepo.api.settings import (
    get_access_token_expire_minutes,
    get_jwt_secret_key,
)
from ai_engineering_company_project_monorepo.models.user import User
from ai_engineering_company_project_monorepo.services.email_service import send_password_reset_email
from ai_engineering_company_project_monorepo.services.password_reset import (
    accept_password_reset_request,
    change_password,
    create_password_reset_token,
    record_password_reset_event,
    reset_password,
)
from ai_engineering_company_project_monorepo.services.profile_service import get_profile_by_user_id
from ai_engineering_company_project_monorepo.services.user_service import get_user_by_email


router = APIRouter(prefix="/auth", tags=["auth"])
PASSWORD_RESET_MESSAGE = "If the email is registered, a password reset link will be sent."
_logger = logging.getLogger(__name__)
Database = Annotated[TinyDB, Depends(get_database)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    database: Database,
    background_tasks: BackgroundTasks,
    request: Request,
) -> dict[str, str]:
    ip_address = request.client.host if request.client else None
    background_tasks.add_task(process_password_reset_request, database, str(payload.email), ip_address)
    return {"message": PASSWORD_RESET_MESSAGE}


def _record_password_reset_event_safely(
    database: TinyDB,
    event: str,
    ip_address: str | None,
    *,
    email: str | None = None,
    user_id: str | None = None,
) -> None:
    try:
        record_password_reset_event(database, event, ip_address, email=email, user_id=user_id)
    except Exception:
        _logger.error("Password reset audit could not be recorded")


def _record_password_reset_failure(database: TinyDB, email: str, ip_address: str | None) -> None:
    _logger.error("Password reset request could not be processed")
    _record_password_reset_event_safely(database, "request_failed", ip_address, email=email)


def process_password_reset_request(database: TinyDB, email: str, ip_address: str | None) -> None:
    try:
        accepted = accept_password_reset_request(database, email, ip_address)
    except (KeyError, OSError, RuntimeError, TypeError, ValueError):
        _record_password_reset_failure(database, email, ip_address)
        return
    if not accepted:
        return

    try:
        user = get_user_by_email(database, email)
    except (KeyError, OSError, TypeError, ValueError):
        _record_password_reset_failure(database, email, ip_address)
        return
    if user is None:
        return

    try:
        token = create_password_reset_token(database, user)
    except (KeyError, OSError, RuntimeError, TypeError, ValueError):
        _record_password_reset_failure(database, email, ip_address)
        return
    _record_password_reset_event_safely(database, "token_created", ip_address, user_id=user.id)

    try:
        sent = send_password_reset_email(user.email, token)
    except Exception:
        _logger.error("Password reset email could not be sent; check email service and reset URL configuration")
        sent = False
    _record_password_reset_event_safely(
        database,
        "email_sent" if sent else "email_failed",
        ip_address,
        user_id=user.id,
    )


@router.post("/reset-password")
def reset_user_password(payload: ResetPasswordRequest, database: Database, request: Request) -> dict[str, str]:
    ip_address = request.client.host if request.client else None
    try:
        reset_password(database, payload.token, payload.new_password, ip_address=ip_address)
    except ValueError as error:
        _record_password_reset_event_safely(database, "reset_rejected", ip_address)
        raise HTTPException(status_code=400, detail="Invalid or expired reset token") from error
    except RuntimeError as error:
        _record_password_reset_event_safely(database, "reset_failed", ip_address)
        raise HTTPException(status_code=500, detail="Token configuration is invalid") from error
    return {"message": "Password reset successfully."}


@router.post("/change-password")
def change_user_password(
    payload: ChangePasswordRequest,
    current_user: CurrentUser,
    database: Database,
) -> dict[str, str]:
    try:
        change_password(database, current_user.id, payload.current_password, payload.new_password)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Current password is incorrect") from error
    return {"message": "Password changed successfully."}


@router.post("/login", response_model=AccessTokenResponse)
def login(payload: LoginRequest, database: Database) -> AccessTokenResponse:
    user = get_user_by_email(database, str(payload.email))
    valid_password = False
    if user is not None:
        try:
            valid_password = bcrypt.checkpw(
                payload.password.encode("utf-8"),
                user.hashed_password.encode("ascii"),
            )
        except (ValueError, UnicodeEncodeError):
            valid_password = False

    if user is None or not user.is_active or not valid_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        secret_key = get_jwt_secret_key()
        expire_minutes = get_access_token_expire_minutes()
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token configuration is invalid",
        ) from error

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    token = jwt.encode(
        {"sub": user.id, "exp": expires_at},
        secret_key,
        algorithm="HS256",
    )
    return AccessTokenResponse(
        access_token=token,
        expires_in=expire_minutes * 60,
    )


@router.get("/me", response_model=AuthMeResponse)
def read_authenticated_user(
    current_user: CurrentUser,
    database: Database,
) -> AuthMeResponse:
    profile = get_profile_by_user_id(database, current_user.id)
    return AuthMeResponse(
        email=current_user.email,
        role=current_user.role,
        profile=(
            AuthProfileResponse(
                name=profile.name,
                phone=profile.phone,
                address=profile.address,
            )
            if profile is not None
            else None
        ),
    )