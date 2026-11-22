from uuid import UUID

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field, HttpUrl, field_validator
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert

from app.api.auth import AdminWrite, CurrentAdmin
from app.api.dependencies import AppSettings, Database
from app.api.errors import ApiError
from app.db.models import AboutPage
from app.services.articles import media_warnings
from app.services.markdown import render_article

router = APIRouter(tags=["about"])


class SocialLink(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    url: HttpUrl

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, value):
        if isinstance(value, str):
            if "\x00" in value:
                raise ValueError("invalid link name")
            return value.strip()
        return value


class AboutContent(BaseModel):
    bio_md: str = Field(default="", max_length=20_000)
    avatar_media_id: UUID | None = None
    links: list[SocialLink] = Field(default_factory=list, max_length=10)

    @field_validator("bio_md")
    @classmethod
    def validate_bio(cls, value: str) -> str:
        if "\x00" in value:
            raise ValueError("invalid introduction")
        return value


class PublicAbout(BaseModel):
    bio_html: str = ""
    avatar_url: str | None = None
    links: list[SocialLink] = Field(default_factory=list)


@router.get("/api/v1/public/about")
def get_public_about(response: Response, db: Database) -> PublicAbout:
    response.headers["Cache-Control"] = "no-store"
    about = db.get(AboutPage, 1)
    if about is None:
        return PublicAbout()
    return PublicAbout(
        bio_html=about.bio_html, links=about.links,
        avatar_url=f"/media/{about.avatar_media_id}" if about.avatar_media_id else None,
    )


@router.get("/api/v1/admin/about")
def get_admin_about(response: Response, db: Database, _admin: CurrentAdmin) -> AboutContent:
    response.headers["Cache-Control"] = "no-store"
    about = db.get(AboutPage, 1)
    return AboutContent.model_validate(about, from_attributes=True) if about else AboutContent()


@router.put("/api/v1/admin/about")
def save_about(
    payload: AboutContent, response: Response, db: Database, settings: AppSettings, _admin: AdminWrite,
) -> AboutContent:
    rendered = render_article(payload.bio_md, allow_images=False)
    if payload.avatar_media_id and media_warnings(db, settings, rendered, payload.avatar_media_id):
        raise ApiError(400, "avatar_not_found", "头像已不可用，请重新上传或移除。")
    values = {
        "bio_md": payload.bio_md, "bio_html": rendered.html,
        "avatar_media_id": payload.avatar_media_id,
        "links": [link.model_dump(mode="json") for link in payload.links],
    }
    db.execute(
        insert(AboutPage).values(id=1, **values).on_conflict_do_update(
            index_elements=[AboutPage.id], set_={**values, "updated_at": func.now()},
        )
    )
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return payload
