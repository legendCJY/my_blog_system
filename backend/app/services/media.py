from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
import re

from PIL import Image, UnidentifiedImageError
from vercel import blob
from vercel.blob import sync

from app.api.errors import ApiError
from app.config import Settings


MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000
IMAGE_FORMATS = {
    "PNG": ("png", "image/png"),
    "JPEG": ("jpg", "image/jpeg"),
    "WEBP": ("webp", "image/webp"),
    "GIF": ("gif", "image/gif"),
}


@dataclass(frozen=True)
class ImageInfo:
    extension: str
    mime_type: str
    width: int
    height: int


def identify_image(content: bytes) -> ImageInfo:
    try:
        with Image.open(BytesIO(content), formats=list(IMAGE_FORMATS)) as image:
            width, height = image.size
            if width * height > MAX_IMAGE_PIXELS:
                raise ApiError(400, "image_dimensions", "图片尺寸过大，请缩小后重试。")
            image.load()
            extension, mime_type = IMAGE_FORMATS[image.format]
            return ImageInfo(extension, mime_type, width, height)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise ApiError(400, "invalid_image", "请选择有效的 JPG、PNG、WebP 或 GIF 图片。") from None


def _file_path(settings: Settings, key: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{32}\.(png|jpg|webp|gif)", key):
        raise FileNotFoundError(key)
    return settings.media_directory / key


def write_image(settings: Settings, key: str, content: bytes, mime_type: str) -> None:
    if settings.media_backend == "blob":
        sync.put_blob(key, content, access="private", content_type=mime_type)
        return

    path = _file_path(settings, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as file:
        file.write(content)


def read_image(settings: Settings, key: str) -> bytes:
    if settings.media_backend == "blob":
        return sync.get_blob(key, access="private").body
    return _file_path(settings, key).read_bytes()


def image_exists(settings: Settings, key: str) -> bool:
    try:
        if settings.media_backend == "blob":
            sync.head_blob(key)
            return True
        return _file_path(settings, key).is_file()
    except FileNotFoundError:
        return False


def remove_image(settings: Settings, key: str) -> None:
    try:
        if settings.media_backend == "blob":
            sync.delete_blob(key)
        else:
            _file_path(settings, key).unlink(missing_ok=True)
    except (OSError, blob.BlobError):
        pass
