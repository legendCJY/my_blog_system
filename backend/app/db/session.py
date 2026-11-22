from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine, URL, make_url


def normalize_database_url(database_url: str) -> URL:
    url = make_url(database_url)
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg")
    return url


@lru_cache(maxsize=1)
def get_engine(database_url: str) -> Engine:
    return create_engine(
        normalize_database_url(database_url),
        pool_pre_ping=True,
        connect_args={"connect_timeout": 3},
        hide_parameters=True,
    )
