from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from hashlib import sha256
from math import ceil
from secrets import compare_digest, token_urlsafe

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import Admin, AdminSession, LoginAttempt


SESSION_COOKIE = "blog_session"
FAILURE_LIMIT = 8
FAILURE_WINDOW = timedelta(minutes=15)
password_hasher = PasswordHasher()


@dataclass(frozen=True)
class SessionIdentity:
    username: str
    csrf_token: str
    token_hash: str


@dataclass(frozen=True)
class LoginResult:
    token: str | None = None
    retry_after: int | None = None


def _digest(value: str) -> str:
    return sha256(value.encode()).hexdigest()


@lru_cache(maxsize=1)
def _dummy_password_hash() -> str:
    return password_hasher.hash(token_urlsafe(32))


def _password_matches(admin: Admin | None, username: str, password: str) -> bool:
    password_hash = admin.password_hash if admin is not None else _dummy_password_hash()
    try:
        verified = password_hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False

    return verified and admin is not None and compare_digest(
        admin.username.encode(), username.encode()
    )


def login(
    db: Session,
    *,
    username: str,
    password: str,
    client_host: str,
    previous_token: str | None,
    ttl_seconds: int,
) -> LoginResult:
    scope_key = _digest(client_host)
    now = datetime.now(UTC)

    with db.begin():
        db.execute(
            delete(LoginAttempt).where(LoginAttempt.window_started_at < now - timedelta(days=1))
        )
        db.execute(
            insert(LoginAttempt)
            .values(scope_key=scope_key, window_started_at=now)
            .on_conflict_do_nothing(index_elements=[LoginAttempt.scope_key])
        )
        attempt = db.get_one(LoginAttempt, scope_key, with_for_update=True)
        now = datetime.now(UTC)
        if attempt.blocked_until is not None and attempt.blocked_until > now:
            return LoginResult(retry_after=ceil((attempt.blocked_until - now).total_seconds()))

        if attempt.window_started_at <= now - FAILURE_WINDOW:
            attempt.window_started_at = now
            attempt.attempt_count = 0
            attempt.blocked_until = None

        admin = db.get(Admin, 1)
        if not _password_matches(admin, username, password):
            attempt.attempt_count += 1
            if attempt.attempt_count >= FAILURE_LIMIT:
                attempt.blocked_until = now + FAILURE_WINDOW
            return LoginResult()

        if password_hasher.check_needs_rehash(admin.password_hash):
            admin.password_hash = password_hasher.hash(password)

        db.delete(attempt)
        db.execute(delete(AdminSession).where(AdminSession.expires_at <= now))
        if previous_token:
            db.execute(
                delete(AdminSession).where(AdminSession.token_hash == _digest(previous_token))
            )

        token = token_urlsafe(32)
        db.add(
            AdminSession(
                token_hash=_digest(token),
                admin_id=admin.id,
                csrf_token=token_urlsafe(32),
                expires_at=now + timedelta(seconds=ttl_seconds),
            )
        )
        return LoginResult(token=token)


def find_session(db: Session, token: str | None) -> SessionIdentity | None:
    if not token or len(token) != 43:
        return None

    result = db.execute(
        select(Admin.username, AdminSession.csrf_token, AdminSession.token_hash)
        .join(AdminSession, Admin.id == AdminSession.admin_id)
        .where(
            AdminSession.token_hash == _digest(token),
            AdminSession.expires_at > datetime.now(UTC),
        )
    ).one_or_none()
    return SessionIdentity(*result) if result is not None else None


def revoke_session(db: Session, identity: SessionIdentity) -> None:
    db.execute(delete(AdminSession).where(AdminSession.token_hash == identity.token_hash))
    db.commit()
