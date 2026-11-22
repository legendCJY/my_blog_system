from unicodedata import normalize
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.db.models import Article, ArticleTag, Category, Tag
from app.schemas.articles import TaxonomyOption

TaxonomyModel = type[Category] | type[Tag]


class TaxonomyCount(TaxonomyOption):
    article_count: int


def listed_taxonomy(db: Session, model: TaxonomyModel, *, published_only: bool) -> list[TaxonomyCount]:
    if model is Category:
        linked = select(Article.category_id.label("id"))
    else:
        linked = select(ArticleTag.tag_id.label("id")).join(Article, Article.id == ArticleTag.article_id)
    if published_only:
        linked = linked.where(Article.status == "published")
    links = linked.subquery()
    counts = select(links.c.id, func.count().label("total")).group_by(links.c.id).subquery()
    rows = db.execute(
        select(model, func.coalesce(counts.c.total, 0))
        .outerjoin(counts, counts.c.id == model.id).order_by(model.name, model.id)
    )
    return [TaxonomyCount(id=item.id, name=item.name, slug=item.slug, article_count=count)
            for item, count in rows]


def taxonomy_by_slug(db: Session, model: TaxonomyModel, slug: str) -> Category | Tag:
    item = db.scalar(select(model).where(model.slug == slug))
    if item is None:
        label = "分类" if model is Category else "标签"
        raise ApiError(404, "taxonomy_not_found", f"这个{label}已不可用。")
    return item


def taxonomy_by_id(db: Session, model: TaxonomyModel, value: str) -> Category | Tag:
    try:
        identifier = UUID(value)
    except ValueError:
        raise ApiError(404, "taxonomy_not_found", "这条记录已不可用。") from None
    item = db.get(model, identifier, with_for_update=True)
    if item is None:
        raise ApiError(404, "taxonomy_not_found", "这条记录已不可用。")
    return item


def taxonomy_name(value: str) -> tuple[str, str]:
    name = " ".join(value.split())
    normalized = normalize("NFKC", name).casefold()
    if not name or "\x00" in name:
        raise ApiError(400, "invalid_name", "请填写有效的名称。")
    return name, normalized
