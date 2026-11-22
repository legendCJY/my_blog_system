from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str | None = None
    database_direct_url: str | None = None
    public_site_url: AnyHttpUrl = "http://127.0.0.1:5173"
    session_ttl_seconds: int = Field(default=86_400, gt=0)
    cookie_secure: bool = False
    media_backend: Literal["local", "blob"] = "local"
    media_root: Path = Path(".local/media")
    site_timezone: str = "Asia/Shanghai"

    @field_validator("site_timezone")
    @classmethod
    def validate_site_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ValueError, ZoneInfoNotFoundError):
            raise ValueError("SITE_TIMEZONE must be a valid IANA time zone") from None
        return value

    @property
    def media_directory(self) -> Path:
        return Path(__file__).resolve().parents[2] / self.media_root

    @property
    def public_origin(self) -> str:
        url = urlsplit(str(self.public_site_url))
        return f"{url.scheme}://{url.netloc}"

    @property
    def secure_session_cookie(self) -> bool:
        return self.cookie_secure or self.public_site_url.scheme == "https"
