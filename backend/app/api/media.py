from pathlib import PurePosixPath
from uuid import UUID, uuid4

from fastapi import APIRouter, Response, UploadFile
from sqlalchemy import exists, or_, select
from sqlalchemy.exc import IntegrityError
from vercel import blob

from app.api.auth import AdminWrite, CurrentAdmin
from app.api.dependencies import AppSettings, Database
from app.api.errors import ApiError
from app.db.models import AboutPage, Article, ArticleMedia, Media
from app.services.media import MAX_IMAGE_BYTES, identify_image, read_image, remove_image, write_image

router = APIRouter(tags=["media"])


def _image_not_found() -> ApiError:
    return ApiError(404, "media_not_found", "图片已不可用。")


def _serve_image(settings: AppSettings, image: Media | None) -> Response:
    if image is None:
        raise _image_not_found()
    try:
        content = read_image(settings, image.storage_key)
    except FileNotFoundError:
        raise _image_not_found() from None
    except (OSError, blob.BlobError):
        raise ApiError(503, "media_unavailable", "暂时无法读取图片。") from None
    return Response(
        content, media_type=image.mime_type,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.post("/api/v1/admin/media", status_code=201)
def upload_image(
    file: UploadFile, db: Database, settings: AppSettings, _admin: AdminWrite, response: Response,
) -> dict:
    content = file.file.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise ApiError(413, "image_too_large", "图片大小上限为 4 MiB。")
    info = identify_image(content)
    media_id = uuid4()
    key = f"{media_id.hex}.{info.extension}"
    try:
        write_image(settings, key, content, info.mime_type)
    except (OSError, blob.BlobError):
        remove_image(settings, key)
        raise ApiError(503, "media_unavailable", "图片上传失败，请稍后重试。") from None

    filename = PurePosixPath((file.filename or "图片").replace("\\", "/")).name
    db.add(Media(
        id=media_id, storage_key=key, original_name=filename, mime_type=info.mime_type,
        bytes=len(content), width=info.width, height=info.height,
    ))
    try:
        db.commit()
    except IntegrityError:
        remove_image(settings, key)
        raise

    response.headers["Cache-Control"] = "no-store"
    return {"id": media_id, "url": f"/media/{media_id}", "original_name": filename}


@router.get("/api/v1/admin/media/{media_id}/content")
def get_admin_image(
    media_id: UUID, db: Database, settings: AppSettings, _admin: CurrentAdmin,
) -> Response:
    return _serve_image(settings, db.get(Media, media_id))


@router.get("/media/{media_id}")
def get_public_image(media_id: str, db: Database, settings: AppSettings) -> Response:
    try:
        identifier = UUID(media_id)
    except ValueError:
        raise _image_not_found() from None
    published_cover = exists().where(Article.status == "published", Article.cover_media_id == identifier)
    published_body = exists(
        select(1).select_from(ArticleMedia).join(Article, Article.id == ArticleMedia.article_id)
        .where(Article.status == "published", ArticleMedia.media_id == identifier)
    )
    public_avatar = exists().where(AboutPage.avatar_media_id == identifier)
    image = db.scalar(select(Media).where(
        Media.id == identifier, or_(published_cover, published_body, public_avatar)
    ))
    return _serve_image(settings, image)
