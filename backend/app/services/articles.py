from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from vercel import blob

from app.api.errors import ApiError
from app.config import Settings
from app.db.models import Article, ArticleLink, ArticleMedia, ArticleTag, Category, Media, Tag
from app.schemas.articles import ArticleContent, ArticleDetail
from app.services.markdown import RenderedArticle, render_article, slugify
from app.services.media import image_exists


PAGE_SIZE = 10


def parse_page(page: str) -> int:
    if not page.isascii() or not page.isdecimal() or len(page) > 12 or int(page) < 1:
        raise ApiError(400, "invalid_page", "页码无效。")
    return int(page)


def page_count(total: int, page: int) -> int:
    total_pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    if page > total_pages:
        raise ApiError(404, "page_not_found", "文章列表页不存在。", details={"total_pages": total_pages})
    return total_pages


def find_article(db: Session, identifier: str, *, lock: bool = False) -> Article:
    try:
        article_id = UUID(identifier)
    except ValueError:
        raise ApiError(404, "article_not_found", "这条记录已不可用。") from None

    article = db.get(Article, article_id, with_for_update=lock)
    if article is None:
        raise ApiError(404, "article_not_found", "这条记录已不可用。")
    return article


def check_revision(article: Article, revision: int) -> None:
    if article.revision != revision:
        raise ApiError(409, "revision_conflict", "文章已在别处更新，请重新载入或另存为草稿。")


def article_detail(db: Session, article: Article) -> ArticleDetail:
    rendered = render_article(article.body_md, private=True)
    tag_ids = list(db.scalars(select(ArticleTag.tag_id).where(ArticleTag.article_id == article.id)))
    slug = db.scalar(select(ArticleLink.slug).where(ArticleLink.article_id == article.id))
    return ArticleDetail(
        id=article.id, title=article.title, status=article.status, updated_at=article.updated_at,
        body_md=article.body_md, summary=article.summary, cover_media_id=article.cover_media_id,
        category_id=article.category_id, tag_ids=tag_ids, revision=article.revision,
        slug=slug, preview_html=rendered.html, toc=rendered.toc,
    )


def media_warnings(
    db: Session, settings: Settings, rendered: RenderedArticle, cover_id: UUID | None,
) -> list[str]:
    references = {media_id: [label] for media_id, label in rendered.media_ids.items()}
    if cover_id:
        references.setdefault(cover_id, []).append(f"封面 /media/{cover_id}")
    stored = {image.id: image for image in db.scalars(select(Media).where(Media.id.in_(references)))}
    missing = list(rendered.invalid_images)
    try:
        for media_id, labels in references.items():
            image = stored.get(media_id)
            if image is None or not image_exists(settings, image.storage_key):
                missing.extend(labels)
    except (OSError, blob.BlobError):
        raise ApiError(503, "media_unavailable", "暂时无法检查图片，请稍后重试。") from None
    return missing


def apply_content(db: Session, article: Article, content: ArticleContent) -> RenderedArticle:
    tag_ids = set(content.tag_ids)
    if content.category_id is not None and db.get(Category, content.category_id) is None:
        raise ApiError(400, "category_not_found", "所选分类已不存在。")
    if set(db.scalars(select(Tag.id).where(Tag.id.in_(tag_ids)))) != tag_ids:
        raise ApiError(400, "tag_not_found", "所选标签已不存在。")
    if content.cover_media_id is not None and db.get(Media, content.cover_media_id) is None:
        raise ApiError(400, "cover_not_found", "所选封面已不存在，请替换或移除。")

    rendered = render_article(content.body_md)
    article.title = content.title.strip()
    article.body_md = content.body_md
    article.body_html = rendered.html
    article.toc = rendered.toc
    article.search_text = rendered.search_text
    article.summary = (content.summary or "").strip() or None
    article.cover_media_id = content.cover_media_id
    article.category_id = content.category_id

    db.execute(delete(ArticleTag).where(ArticleTag.article_id == article.id))
    db.add_all(ArticleTag(article_id=article.id, tag_id=tag_id) for tag_id in tag_ids)
    body_ids = db.scalars(select(Media.id).where(Media.id.in_(rendered.media_ids))).all()
    db.execute(delete(ArticleMedia).where(ArticleMedia.article_id == article.id))
    db.add_all(ArticleMedia(article_id=article.id, media_id=media_id) for media_id in body_ids)
    return rendered


def validate_public_content(
    db: Session, settings: Settings, article: Article, rendered: RenderedArticle,
) -> None:
    if not article.title or not article.body_md.strip():
        raise ApiError(400, "incomplete_article", "发布文章需要标题和正文。")
    missing = media_warnings(db, settings, rendered, article.cover_media_id)
    if missing:
        raise ApiError(400, "missing_images", "请替换或移除以下失效图片。", details=missing)


def reserve_slug(db: Session, article: Article) -> None:
    if db.scalar(select(ArticleLink.slug).where(ArticleLink.article_id == article.id)):
        return

    base = slugify(article.title)[:70].rstrip("-") or f"article-{article.id.hex[:12]}"
    suffix = 1
    while True:
        candidate = base if suffix == 1 else f"{base}-{suffix}"
        result = db.scalar(
            insert(ArticleLink).values(slug=candidate, article_id=article.id)
            .on_conflict_do_nothing(index_elements=[ArticleLink.slug])
            .returning(ArticleLink.slug)
        )
        if result:
            return
        suffix += 1


def touch(article: Article, *, content_updated: bool = False) -> None:
    now = datetime.now(UTC)
    article.revision += 1
    article.updated_at = now
    if content_updated:
        article.content_updated_at = now
