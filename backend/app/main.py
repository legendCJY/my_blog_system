from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import OperationalError

from app.api.about import router as about_router
from app.api.admin_articles import router as admin_articles_router
from app.api.auth import router as auth_router
from app.api.errors import (
    ApiError, api_error_response, database_unavailable_response, validation_error_response,
)
from app.api.health import router as health_router
from app.api.media import router as media_router
from app.api.public_articles import router as public_articles_router
from app.api.public_archive import router as archive_router
from app.api.taxonomy import taxonomy_router
from app.config import Settings
from app.db.models import Category, Tag


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="个人博客 API", version="0.1.0")
    app.state.settings = settings if settings is not None else Settings()
    app.add_exception_handler(ApiError, api_error_response)
    app.add_exception_handler(RequestValidationError, validation_error_response)
    app.add_exception_handler(OperationalError, database_unavailable_response)
    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(admin_articles_router)
    app.include_router(media_router)
    app.include_router(public_articles_router)
    app.include_router(taxonomy_router("categories", Category, "分类"))
    app.include_router(taxonomy_router("tags", Tag, "标签"))
    app.include_router(archive_router)
    app.include_router(about_router)
    return app


app = create_app()
