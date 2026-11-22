from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.config import Settings
from app.db.session import get_engine


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


AppSettings = Annotated[Settings, Depends(get_settings)]


def get_database(settings: AppSettings) -> Iterator[Session]:
    if not settings.database_url:
        raise ApiError(503, "database_unavailable", "暂时无法连接数据库。")
    with Session(get_engine(settings.database_url)) as session:
        yield session


Database = Annotated[Session, Depends(get_database)]
