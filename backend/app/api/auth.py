from secrets import compare_digest
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from app.api.dependencies import AppSettings, Database
from app.api.errors import ApiError
from app.services import auth

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginInput(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=1024)


class SessionResponse(BaseModel):
    username: str
    csrf_token: str


def require_admin(request: Request, db: Database) -> auth.SessionIdentity:
    identity = auth.find_session(db, request.cookies.get(auth.SESSION_COOKIE))
    if identity is None:
        raise ApiError(401, "authentication_required", "请先登录后台。")
    return identity


CurrentAdmin = Annotated[auth.SessionIdentity, Depends(require_admin)]


def _check_origin(origin: str | None, settings: AppSettings) -> None:
    if origin != settings.public_origin:
        raise ApiError(403, "invalid_origin", "请求来源无效，请从博客页面重试。")


def require_admin_write(
    request: Request, settings: AppSettings, admin: CurrentAdmin
) -> auth.SessionIdentity:
    _check_origin(request.headers.get("origin"), settings)
    csrf = request.headers.get("x-csrf-token", "")
    if not compare_digest(csrf.encode(), admin.csrf_token.encode()):
        raise ApiError(403, "invalid_csrf", "页面已失效，请刷新后重试。")
    return admin


AdminWrite = Annotated[auth.SessionIdentity, Depends(require_admin_write)]


@router.post("/login")
def login(
    payload: LoginInput,
    request: Request,
    response: Response,
    settings: AppSettings,
    db: Database,
) -> dict[str, str]:
    _check_origin(request.headers.get("origin"), settings)
    result = auth.login(
        db,
        username=payload.username.strip(),
        password=payload.password,
        client_host=request.client.host if request.client else "unknown",
        previous_token=request.cookies.get(auth.SESSION_COOKIE),
        ttl_seconds=settings.session_ttl_seconds,
    )
    if result.retry_after is not None:
        raise ApiError(
            429,
            "login_rate_limited",
            "登录尝试次数过多，请稍后重试。",
            headers={"Retry-After": str(result.retry_after)},
        )
    if result.token is None:
        raise ApiError(401, "invalid_credentials", "账号或密码不正确。")

    response.set_cookie(
        auth.SESSION_COOKIE,
        result.token,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=settings.secure_session_cookie,
        samesite="lax",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return {"status": "ok"}


@router.get("/session")
def session(response: Response, admin: CurrentAdmin) -> SessionResponse:
    response.headers["Cache-Control"] = "no-store"
    return SessionResponse(username=admin.username, csrf_token=admin.csrf_token)


@router.post("/logout", status_code=204)
def logout(settings: AppSettings, db: Database, admin: AdminWrite) -> Response:
    auth.revoke_session(db, admin)
    response = Response(status_code=204, headers={"Cache-Control": "no-store"})
    response.delete_cookie(
        auth.SESSION_COOKIE,
        path="/",
        httponly=True,
        secure=settings.secure_session_cookie,
        samesite="lax",
    )
    return response
