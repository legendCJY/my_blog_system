import logging

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_engine

router = APIRouter(prefix="/health", tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready", responses={503: {"description": "Database unavailable"}})
def ready(request: Request) -> JSONResponse:
    database_url = request.app.state.settings.database_url
    database_ready = False

    if database_url:
        try:
            with get_engine(database_url).connect() as connection:
                connection.execute(text("SELECT 1"))
            database_ready = True
        except SQLAlchemyError:
            logger.warning("PostgreSQL readiness check failed.")

    return JSONResponse(
        {
            "status": "ok" if database_ready else "unavailable",
            "database": "ok" if database_ready else "unavailable",
        },
        status_code=(
            status.HTTP_200_OK if database_ready else status.HTTP_503_SERVICE_UNAVAILABLE
        ),
        headers={"Cache-Control": "no-store"},
    )
