import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from tinydb import TinyDB

from ai_engineering_company_project_monorepo.api.auth import PASSWORD_RESET_MESSAGE, router as auth_router
from ai_engineering_company_project_monorepo.api.incidents import router as incidents_router
from ai_engineering_company_project_monorepo.api.profiles import router as profiles_router
from ai_engineering_company_project_monorepo.api.suppliers import router as suppliers_router
from ai_engineering_company_project_monorepo.api.users import router as users_router
from ai_engineering_company_project_monorepo.services.password_reset import record_password_reset_event


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    database_path = Path(os.getenv("TINYDB_PATH", "data/auth.json"))
    database_path.parent.mkdir(parents=True, exist_ok=True)
    app.state.database = TinyDB(database_path)
    try:
        yield
    finally:
        app.state.database.close()


app = FastAPI(title="Auth API", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def handle_request_validation(request: Request, error: RequestValidationError) -> JSONResponse:
    if request.method == "POST" and request.url.path in {"/auth/forgot-password", "/auth/reset-password"}:
        try:
            record_password_reset_event(
                request.app.state.database,
                "request_invalid" if request.url.path == "/auth/forgot-password" else "reset_invalid_payload",
                request.client.host if request.client else None,
            )
        except Exception:
            logging.getLogger(__name__).error("Password reset audit could not be recorded")
    if request.method == "POST" and request.url.path == "/auth/forgot-password":
        return JSONResponse(status_code=200, content={"message": PASSWORD_RESET_MESSAGE})
    return await request_validation_exception_handler(request, error)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "null",
    ],
    allow_origin_regex=r"https://[a-zA-Z0-9-]+-5173\.(?:app\.)?github\.dev",
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(incidents_router)
app.include_router(users_router)
app.include_router(profiles_router)
app.include_router(suppliers_router)