from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ArticleStatus = Literal["draft", "published", "unpublished"]


class ArticleContent(BaseModel):
    title: str = Field(default="", max_length=240)
    body_md: str = Field(default="", max_length=200_000)
    summary: str | None = Field(default=None, max_length=500)
    cover_media_id: UUID | None = None
    category_id: UUID | None = None
    tag_ids: list[UUID] = Field(default_factory=list, max_length=100)


class NewArticle(ArticleContent):
    id: UUID | None = None


class ArticleRevision(BaseModel):
    revision: int = Field(ge=1)


class ArticleUpdate(ArticleContent, ArticleRevision):
    pass


class ArticlePublication(ArticleRevision):
    content: ArticleContent | None = None


class ArticleSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    status: ArticleStatus
    updated_at: datetime


class ArticlePage(BaseModel):
    items: list[ArticleSummary]
    page: int
    page_size: int
    total: int
    total_pages: int


class ArticleDetail(ArticleSummary, ArticleContent):
    revision: int
    slug: str | None
    preview_html: str
    toc: list[dict]


class TaxonomyOption(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str


class EditorOptions(BaseModel):
    categories: list[TaxonomyOption]
    tags: list[TaxonomyOption]
