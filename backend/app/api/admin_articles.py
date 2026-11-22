from datetime import UTC, datetime
from typing import get_args
from uuid import uuid4

from fastapi import APIRouter, Response
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from app.api.auth import AdminWrite, CurrentAdmin
from app.api.dependencies import AppSettings, Database
from app.api.errors import ApiError
from app.db.models import Article, Category, Tag
from app.schemas.articles import (
    ArticleContent, ArticleDetail, ArticlePage, ArticlePublication, ArticleRevision,
    ArticleStatus, ArticleSummary, ArticleUpdate, EditorOptions, NewArticle,
)
from app.services.articles import (
    PAGE_SIZE, apply_content, article_detail, check_revision, find_article,
    media_warnings, page_count, parse_page, reserve_slug, touch, validate_public_content,
)
from app.services.markdown import render_article

router = APIRouter(prefix="/api/v1/admin/articles", tags=["admin articles"])
ARTICLE_STATUSES = get_args(ArticleStatus)


@router.get("")
def list_articles(
    response: Response, db: Database, _admin: CurrentAdmin,
    page: str = "1", status: str | None = None,
) -> ArticlePage:
    page_number = parse_page(page)
    if status and status not in ARTICLE_STATUSES:
        raise ApiError(400, "invalid_status", "文章状态无效。")
    filters = [Article.status == status] if status else []
    total = db.scalar(select(func.count()).select_from(Article).where(*filters)) or 0
    total_pages = page_count(total, page_number)
    summaries = db.execute(
        select(Article.id, Article.title, Article.status, Article.updated_at)
        .where(*filters).order_by(Article.updated_at.desc(), Article.id.desc())
        .offset((page_number - 1) * PAGE_SIZE).limit(PAGE_SIZE)
    ).all()
    response.headers["Cache-Control"] = "no-store"
    return ArticlePage(
        items=[ArticleSummary.model_validate(article) for article in summaries],
        page=page_number, page_size=PAGE_SIZE, total=total, total_pages=total_pages,
    )


@router.get("/options")
def get_editor_options(response: Response, db: Database, _admin: CurrentAdmin) -> EditorOptions:
    response.headers["Cache-Control"] = "no-store"
    return EditorOptions(
        categories=list(db.scalars(select(Category).order_by(Category.name))),
        tags=list(db.scalars(select(Tag).order_by(Tag.name))),
    )


@router.post("/preview")
def preview_content(
    payload: ArticleContent, response: Response, db: Database, settings: AppSettings, _admin: AdminWrite,
) -> dict:
    rendered = render_article(payload.body_md, private=True)
    response.headers["Cache-Control"] = "no-store"
    return {
        "title": payload.title.strip(), "summary": payload.summary, "cover_media_id": payload.cover_media_id,
        "html": rendered.html, "toc": rendered.toc,
        "missing_images": media_warnings(db, settings, rendered, payload.cover_media_id),
    }


@router.post("", status_code=201)
def create_article(payload: NewArticle, response: Response, db: Database, _admin: AdminWrite) -> ArticleDetail:
    article_id = payload.id or uuid4()
    created = db.scalar(
        insert(Article).values(id=article_id, title="", body_md="")
        .on_conflict_do_nothing(index_elements=[Article.id]).returning(Article.id)
    )
    article = find_article(db, str(article_id), lock=True)
    if created is not None:
        apply_content(db, article, payload)
    detail = article_detail(db, article)
    if created is None:
        same_content = (
            detail.title == payload.title.strip() and detail.body_md == payload.body_md
            and detail.summary == ((payload.summary or "").strip() or None)
            and detail.cover_media_id == payload.cover_media_id
            and detail.category_id == payload.category_id
            and set(detail.tag_ids) == set(payload.tag_ids)
        )
        if not same_content:
            raise ApiError(409, "article_already_created", "草稿已创建，请打开原草稿或另存为新草稿。")
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return detail


@router.get("/{article_id}")
def get_article(article_id: str, response: Response, db: Database, _admin: CurrentAdmin) -> ArticleDetail:
    response.headers["Cache-Control"] = "no-store"
    return article_detail(db, find_article(db, article_id))


@router.patch("/{article_id}")
def update_article(
    article_id: str, payload: ArticleUpdate, response: Response, db: Database,
    settings: AppSettings, _admin: AdminWrite,
) -> ArticleDetail:
    article = find_article(db, article_id, lock=True)
    check_revision(article, payload.revision)
    rendered = apply_content(db, article, payload)
    if article.status == "published":
        validate_public_content(db, settings, article, rendered)
    touch(article, content_updated=article.status == "published")
    detail = article_detail(db, article)
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return detail


@router.post("/{article_id}/publish")
def publish_article(
    article_id: str, payload: ArticlePublication, response: Response, db: Database,
    settings: AppSettings, _admin: AdminWrite,
) -> ArticleDetail:
    article = find_article(db, article_id, lock=True)
    check_revision(article, payload.revision)
    if article.status == "published":
        raise ApiError(409, "already_published", "文章已发布，请使用更新文章。")
    if payload.content is not None:
        rendered = apply_content(db, article, payload.content)
    else:
        rendered = render_article(article.body_md)
    validate_public_content(db, settings, article, rendered)
    reserve_slug(db, article)
    if article.first_published_at is None:
        article.first_published_at = datetime.now(UTC)
    touch(article, content_updated=article.status == "unpublished" and payload.content is not None)
    article.status = "published"
    detail = article_detail(db, article)
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return detail


@router.post("/{article_id}/unpublish")
def unpublish_article(
    article_id: str, payload: ArticleRevision, response: Response, db: Database, _admin: AdminWrite,
) -> ArticleDetail:
    article = find_article(db, article_id, lock=True)
    check_revision(article, payload.revision)
    if article.status != "published":
        raise ApiError(409, "article_not_published", "文章当前未发布。")
    article.status = "unpublished"
    touch(article)
    detail = article_detail(db, article)
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return detail


@router.delete("/{article_id}", status_code=204)
def delete_article(
    article_id: str, payload: ArticleRevision, db: Database, _admin: AdminWrite,
) -> Response:
    article = find_article(db, article_id, lock=True)
    check_revision(article, payload.revision)
    db.delete(article)
    db.commit()
    return Response(status_code=204, headers={"Cache-Control": "no-store"})
