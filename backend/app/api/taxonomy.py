from uuid import uuid4

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import AppSettings, Database
from app.api.errors import ApiError
from app.api.auth import AdminWrite, CurrentAdmin
from app.api.public_articles import PublicArticlePage, article_page
from app.db.models import Category, Tag
from app.schemas.articles import TaxonomyOption
from app.services.markdown import slugify
from app.services.taxonomy import (
    TaxonomyCount, TaxonomyModel, listed_taxonomy, taxonomy_by_id, taxonomy_by_slug, taxonomy_name,
)


class TaxonomyInput(BaseModel):
    name: str = Field(max_length=80)


class TaxonomyPage(BaseModel):
    taxonomy: TaxonomyOption
    articles: PublicArticlePage


def taxonomy_router(path: str, model: TaxonomyModel, label: str) -> APIRouter:
    router = APIRouter(tags=[path])
    public = f"/api/v1/public/{path}"
    admin = f"/api/v1/admin/{path}"

    def save(db: Database) -> None:
        try:
            db.commit()
        except IntegrityError as error:
            if getattr(getattr(error.orig, "diag", None), "constraint_name", None) != (
                f"{path}_normalized_name_key"
            ):
                raise
            raise ApiError(409, "duplicate_name", f"已存在同名{label}。") from None

    @router.get(public, name=f"public_{path}")
    def public_list(response: Response, db: Database) -> list[TaxonomyCount]:
        response.headers["Cache-Control"] = "no-store"
        return listed_taxonomy(db, model, published_only=True)

    @router.get(f"{public}/{{slug}}", name=f"public_{path}_articles")
    def public_detail(
        slug: str, response: Response, db: Database, settings: AppSettings, page: str = "1",
    ) -> TaxonomyPage:
        item = taxonomy_by_slug(db, model, slug)
        response.headers["Cache-Control"] = "no-store"
        return TaxonomyPage(
            taxonomy=TaxonomyOption.model_validate(item),
            articles=article_page(
                db, settings.site_timezone, page,
                category=item if isinstance(item, Category) else None,
                tag=item if isinstance(item, Tag) else None,
            ),
        )

    @router.get(admin, name=f"admin_{path}")
    def admin_list(response: Response, db: Database, _admin: CurrentAdmin) -> list[TaxonomyCount]:
        response.headers["Cache-Control"] = "no-store"
        return listed_taxonomy(db, model, published_only=False)

    @router.post(admin, status_code=201, name=f"create_{path}")
    def create(payload: TaxonomyInput, response: Response, db: Database, _admin: AdminWrite) -> TaxonomyOption:
        name, normalized = taxonomy_name(payload.name)
        identifier = uuid4()
        prefix = slugify(name)[:40].rstrip("-")
        slug = f"{prefix}-{identifier.hex}" if prefix else identifier.hex
        item = model(id=identifier, name=name, normalized_name=normalized, slug=slug)
        db.add(item)
        save(db)
        response.headers["Cache-Control"] = "no-store"
        return TaxonomyOption.model_validate(item)

    @router.patch(f"{admin}/{{item_id}}", name=f"rename_{path}")
    def rename(
        item_id: str, payload: TaxonomyInput, response: Response, db: Database, _admin: AdminWrite,
    ) -> TaxonomyOption:
        item = taxonomy_by_id(db, model, item_id)
        item.name, item.normalized_name = taxonomy_name(payload.name)
        save(db)
        response.headers["Cache-Control"] = "no-store"
        return TaxonomyOption.model_validate(item)

    @router.delete(f"{admin}/{{item_id}}", status_code=204, name=f"delete_{path}")
    def delete(item_id: str, db: Database, _admin: AdminWrite) -> Response:
        item = taxonomy_by_id(db, model, item_id)
        db.delete(item)
        db.commit()
        return Response(status_code=204, headers={"Cache-Control": "no-store"})

    return router
