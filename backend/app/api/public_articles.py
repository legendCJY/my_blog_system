from datetime import datetime
import re
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Response
from pydantic import BaseModel
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies import AppSettings, Database
from app.api.errors import ApiError
from app.db.models import Article, ArticleLink, ArticleTag, Category, Tag
from app.schemas.articles import TaxonomyOption
from app.services.articles import PAGE_SIZE, page_count, parse_page
from app.services.taxonomy import taxonomy_by_slug

router = APIRouter(prefix="/api/v1/public/articles", tags=["public articles"])


class PublicArticleSummary(BaseModel):
    slug: str
    title: str
    summary: str
    cover_url: str | None
    first_published_at: datetime
    content_updated_at: datetime | None
    category: TaxonomyOption | None
    site_timezone: str


class PublicArticlePage(BaseModel):
    items: list[PublicArticleSummary]
    page: int
    page_size: int
    total: int
    total_pages: int


class PublicArticleDetail(PublicArticleSummary):
    body_html: str
    toc: list[dict]
    tags: list[TaxonomyOption]


def _summary(article: Article, slug: str, category: Category | None, timezone: str) -> PublicArticleSummary:
    auto_summary = article.search_text[:160].rstrip()
    if len(article.search_text) > 160:
        auto_summary += "…"
    return PublicArticleSummary(
        slug=slug, title=article.title, summary=article.summary or auto_summary,
        cover_url=f"/media/{article.cover_media_id}" if article.cover_media_id else None,
        first_published_at=article.first_published_at, content_updated_at=article.content_updated_at,
        category=TaxonomyOption.model_validate(category) if category is not None else None,
        site_timezone=timezone,
    )


def _published_rows():
    return (
        select(Article, ArticleLink.slug, Category)
        .join(ArticleLink, ArticleLink.article_id == Article.id)
        .outerjoin(Category, Article.category_id == Category.id)
        .where(Article.status == "published")
    )


def article_page(
    db: Session, timezone: str, page: str, *, q: str = "", category: Category | None = None,
    tag: Tag | None = None, year: str | None = None,
) -> PublicArticlePage:
    page_number = parse_page(page)
    query = q.strip()
    if len(query) > 200:
        raise ApiError(400, "invalid_query", "搜索关键词过长。")
    rows = _published_rows()
    if category is not None:
        rows = rows.where(Article.category_id == category.id)
    if tag is not None:
        rows = rows.where(exists().where(ArticleTag.article_id == Article.id, ArticleTag.tag_id == tag.id))
    if year is not None:
        if not re.fullmatch(r"[0-9]{4}", year) or int(year) == 0:
            raise ApiError(400, "invalid_year", "归档年份无效。")
        number = int(year)
        tz = ZoneInfo(timezone)
        rows = rows.where(Article.first_published_at >= datetime(number, 1, 1, tzinfo=tz))
        if number < 9999:
            rows = rows.where(Article.first_published_at < datetime(number + 1, 1, 1, tzinfo=tz))
    if query:
        rows = rows.where(or_(
            Article.title.icontains(query, autoescape=True),
            Article.search_text.icontains(query, autoescape=True),
        ))
    total = db.scalar(select(func.count()).select_from(rows.subquery())) or 0
    total_pages = page_count(total, page_number)
    published = db.execute(rows.order_by(Article.first_published_at.desc(), Article.id.desc())
                           .offset((page_number - 1) * PAGE_SIZE).limit(PAGE_SIZE))
    return PublicArticlePage(
        items=[_summary(article, slug, group, timezone) for article, slug, group in published],
        page=page_number, page_size=PAGE_SIZE, total=total, total_pages=total_pages,
    )


@router.get("")
def list_articles(
    response: Response, db: Database, settings: AppSettings, page: str = "1", q: str = "",
    category: str | None = None, tag: str | None = None, year: str | None = None,
) -> PublicArticlePage:
    response.headers["Cache-Control"] = "no-store"
    return article_page(
        db, settings.site_timezone, page, q=q, year=year,
        category=taxonomy_by_slug(db, Category, category) if category is not None else None,
        tag=taxonomy_by_slug(db, Tag, tag) if tag is not None else None,
    )


@router.get("/{slug}")
def get_article(slug: str, response: Response, db: Database, settings: AppSettings) -> PublicArticleDetail:
    row = db.execute(_published_rows().where(ArticleLink.slug == slug)).one_or_none()
    if row is None:
        raise ApiError(404, "article_not_found", "这篇文章当前无法访问。")
    article, stored_slug, category = row
    tags = db.scalars(
        select(Tag).join(ArticleTag, ArticleTag.tag_id == Tag.id)
        .where(ArticleTag.article_id == article.id).order_by(Tag.name)
    )
    response.headers["Cache-Control"] = "no-store"
    return PublicArticleDetail(
        **_summary(article, stored_slug, category, settings.site_timezone).model_dump(),
        body_html=article.body_html, toc=article.toc,
        tags=[TaxonomyOption.model_validate(tag) for tag in tags],
    )
