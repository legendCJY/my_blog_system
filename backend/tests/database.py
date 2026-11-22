import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy.schema import CreateSchema, DropSchema

from app.config import Settings
from app.db.session import get_engine, normalize_database_url

BACKEND_DIR = Path(__file__).resolve().parents[1]


def configured_database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL") or Settings().database_url
    if not url:
        raise RuntimeError("Set TEST_DATABASE_URL or configure DATABASE_URL in .env for local testing.")
    return url


@contextmanager
def migrated_schema(database_url: str) -> Iterator[str]:
    url = normalize_database_url(database_url)
    if url.host not in {"127.0.0.1", "localhost", "::1"} or {"host", "hostaddr", "service"} & url.query.keys():
        raise RuntimeError("Integration tests require a loopback PostgreSQL connection.")

    schema = f"blog_test_{uuid4().hex}"
    dsn = url.update_query_dict({"options": f"-csearch_path={schema}"}).render_as_string(hide_password=False)
    engine = get_engine(database_url)
    try:
        with engine.begin() as connection:
            connection.execute(CreateSchema(schema))
        try:
            config = Config(BACKEND_DIR / "alembic.ini")
            with patch.dict(os.environ, {"DATABASE_DIRECT_URL": dsn}):
                command.upgrade(config, "head")
                command.check(config)
            yield dsn
        finally:
            get_engine(dsn).dispose()
            with engine.begin() as connection:
                connection.execute(DropSchema(schema, cascade=True))
    finally:
        engine.dispose()
