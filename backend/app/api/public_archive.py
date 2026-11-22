from fastapi import APIRouter, Response
from pydantic import BaseModel
from sqlalchemy import extract, func, select

from app.api.dependencies import AppSettings, Database
from app.db.models import Article

router = APIRouter(prefix="/api/v1/public/archive", tags=["archive"])


class ArchiveYear(BaseModel):
    year: int
    article_count: int


@router.get("")
def list_archive(response: Response, db: Database, settings: AppSettings) -> list[ArchiveYear]:
    year = extract("year", func.timezone(settings.site_timezone, Article.first_published_at))
    rows = db.execute(
        select(year.label("year"), func.count())
        .where(Article.status == "published").group_by(year).order_by(year.desc())
    )
    response.headers["Cache-Control"] = "no-store"
    return [ArchiveYear(year=int(value), article_count=count) for value, count in rows]
