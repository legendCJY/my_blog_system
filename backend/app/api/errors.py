from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        *,
        headers: dict[str, str] | None = None,
        details: list[str] | dict[str, int] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.headers = headers or {}
        self.details = details


async def api_error_response(_request: Request, error: ApiError) -> JSONResponse:
    content: dict = {"code": error.code, "message": error.message}
    if error.details:
        content["details"] = error.details
    return JSONResponse(
        content,
        status_code=error.status,
        headers={"Cache-Control": "no-store", **error.headers},
    )


async def validation_error_response(
    _request: Request, error: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        {
            "code": "invalid_request",
            "message": "请求参数无效。",
            "details": [
                {"field": ".".join(map(str, item["loc"])), "type": item["type"]}
                for item in error.errors()
            ],
        },
        status_code=422,
        headers={"Cache-Control": "no-store"},
    )


async def database_unavailable_response(
    request: Request, _error: OperationalError
) -> JSONResponse:
    return await api_error_response(
        request, ApiError(503, "database_unavailable", "暂时无法连接数据库。")
    )
