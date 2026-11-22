from alembic import context
from sqlalchemy import create_engine, pool

from app.config import Settings
from app.db.models import Base
from app.db.session import normalize_database_url

settings = Settings()
database_url = settings.database_direct_url or settings.database_url
if not database_url:
    raise RuntimeError("Set DATABASE_DIRECT_URL or DATABASE_URL before running Alembic.")

url = normalize_database_url(database_url)

if context.is_offline_mode():
    context.configure(
        dialect_name=url.get_backend_name(), target_metadata=Base.metadata, literal_binds=True
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(url, poolclass=pool.NullPool, hide_parameters=True)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
