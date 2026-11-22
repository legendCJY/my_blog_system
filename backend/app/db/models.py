from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer,
    SmallInteger, String, Text, Uuid, func, text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Admin(Base):
    __tablename__ = "admins"
    __table_args__ = (CheckConstraint("id = 1", name="ck_admins_singleton"),)

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    username: Mapped[str] = mapped_column(String(120), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AdminSession(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id", ondelete="CASCADE"))
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    scope_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempt_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    window_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    blocked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Media(Base):
    __tablename__ = "media"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    storage_key: Mapped[str] = mapped_column(Text, unique=True)
    original_name: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(100))
    bytes: Mapped[int] = mapped_column(BigInteger)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaxonomyFields:
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(Text)
    normalized_name: Mapped[str] = mapped_column(Text, unique=True)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Category(TaxonomyFields, Base):
    __tablename__ = "categories"


class Tag(TaxonomyFields, Base):
    __tablename__ = "tags"


class Article(Base):
    __tablename__ = "articles"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'published', 'unpublished')", name="ck_articles_status"
        ),
        CheckConstraint(
            "status <> 'published' OR first_published_at IS NOT NULL",
            name="ck_articles_published_timestamp",
        ),
        CheckConstraint("revision >= 1", name="ck_articles_revision"),
        Index(
            "ix_articles_published_order",
            text("first_published_at DESC"),
            text("id DESC"),
            postgresql_where=text("status = 'published'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(Text)
    body_md: Mapped[str] = mapped_column(Text)
    body_html: Mapped[str] = mapped_column(Text, server_default="")
    toc: Mapped[list[dict[str, str]]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    search_text: Mapped[str] = mapped_column(Text, server_default="")
    summary: Mapped[str | None] = mapped_column(Text)
    cover_media_id: Mapped[UUID | None] = mapped_column(ForeignKey("media.id"), index=True)
    category_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(String(16), server_default="draft")
    revision: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    first_published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    content_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ArticleLink(Base):
    __tablename__ = "article_links"

    slug: Mapped[str] = mapped_column(Text, primary_key=True)
    article_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("articles.id", ondelete="SET NULL"), unique=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ArticleTag(Base):
    __tablename__ = "article_tags"

    article_id: Mapped[UUID] = mapped_column(
        ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[UUID] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True, index=True
    )


class ArticleMedia(Base):
    __tablename__ = "article_media"

    article_id: Mapped[UUID] = mapped_column(
        ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True
    )
    media_id: Mapped[UUID] = mapped_column(ForeignKey("media.id"), primary_key=True, index=True)


class AboutPage(Base):
    __tablename__ = "about_page"
    __table_args__ = (CheckConstraint("id = 1", name="ck_about_page_singleton"),)

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    bio_md: Mapped[str] = mapped_column(Text, server_default="")
    bio_html: Mapped[str] = mapped_column(Text, server_default="")
    avatar_media_id: Mapped[UUID | None] = mapped_column(ForeignKey("media.id"), index=True)
    links: Mapped[list[dict[str, str]]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
