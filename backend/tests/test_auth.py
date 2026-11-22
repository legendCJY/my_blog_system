import os
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from io import BytesIO
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import cli
from app.config import Settings
from app.db.models import Admin, AdminSession, Article
from app.db.session import get_engine
from app.main import create_app
from app.services.auth import FAILURE_LIMIT, SESSION_COOKIE
from tests.database import configured_database_url, migrated_schema


ORIGIN = "https://blog.test"
LOGIN = "/api/v1/auth/login"
AUTH_SESSION = "/api/v1/auth/session"
LOGOUT = "/api/v1/auth/logout"
ARTICLES = "/api/v1/admin/articles"


@pytest.fixture(scope="module")
def auth_database(request):
    if not (request.config.getoption("--with-postgres") or os.environ.get("TEST_DATABASE_URL")):
        pytest.skip("Use --with-postgres or set TEST_DATABASE_URL to run PostgreSQL integration tests.")

    with migrated_schema(configured_database_url()) as dsn:
        password = uuid4().hex
        with patch.dict(os.environ, {"DATABASE_DIRECT_URL": dsn}):
            with patch("builtins.input", return_value="测试管理员"), patch(
                "app.cli.getpass", return_value=password
            ):
                cli.create_admin()
                with pytest.raises(SystemExit, match="管理员账号已存在"):
                    cli.create_admin()

        test_engine = get_engine(dsn)
        with Session(test_engine) as session, session.begin():
            admin = session.get_one(Admin, 1)
            assert admin.password_hash.startswith("$argon2id$")
            assert admin.password_hash != password
            article = Article(title="测试草稿", body_md="# 测试预览")
            session.add(article)
            session.flush()
            article_id = article.id

        settings = Settings(
            _env_file=None, database_url=dsn, public_site_url=ORIGIN
        )
        yield create_app(settings), test_engine, password, article_id


def test_login_protects_articles_and_logout_revokes_session(auth_database) -> None:
    app, engine, password, article_id = auth_database
    origin = {"Origin": ORIGIN}
    login = {"username": "测试管理员", "password": password}
    with TestClient(app, base_url=ORIGIN, client=("lifecycle", 50000)) as client:
        assert client.get(ARTICLES).status_code == 401
        assert client.get(f"{ARTICLES}/{article_id}").status_code == 401
        assert client.post(LOGIN, json=login).status_code == 403
        assert client.post(LOGIN, json={**login, "password": "wrong"}, headers=origin).status_code == 401

        authenticated = client.post(LOGIN, json=login, headers=origin)
        assert authenticated.status_code == 200
        cookie = authenticated.headers["set-cookie"].lower()
        assert all(flag in cookie for flag in ("secure", "httponly", "samesite=lax"))
        token = client.cookies.get(SESSION_COOKIE)
        assert token
        with Session(engine) as db:
            stored_token = db.scalar(select(AdminSession.token_hash))
            assert stored_token == sha256(token.encode()).hexdigest()
            assert stored_token != token

        identity = client.get(AUTH_SESSION).json()
        assert identity["username"] == login["username"]
        articles = client.get(ARTICLES)
        assert articles.status_code == 200
        assert articles.json()["items"][0]["title"] == "测试草稿"
        assert client.get(f"{ARTICLES}/{article_id}").json()["body_md"] == "# 测试预览"
        assert client.get(f"{ARTICLES}/missing").status_code == 404
        assert client.post(LOGOUT, headers=origin).status_code == 403
        assert client.get(AUTH_SESSION).status_code == 200

        logout = client.post(LOGOUT, headers={**origin, "X-CSRF-Token": identity["csrf_token"]})
        assert logout.status_code == 204
        assert "max-age=0" in logout.headers["set-cookie"].lower()
        assert client.get(AUTH_SESSION, headers={"Cookie": f"{SESSION_COOKIE}={token}"}).status_code == 401


def test_expired_sessions_are_rejected(auth_database) -> None:
    app, engine, password, _article_id = auth_database
    with TestClient(app, base_url=ORIGIN, client=("expired", 50000)) as client:
        response = client.post(
            LOGIN,
            headers={"Origin": ORIGIN},
            json={"username": "测试管理员", "password": password},
        )
        assert response.status_code == 200
        token = client.cookies.get(SESSION_COOKIE)
        assert token
        with Session(engine) as db, db.begin():
            stored = db.get_one(AdminSession, sha256(token.encode()).hexdigest())
            stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        assert client.get(AUTH_SESSION).status_code == 401


def test_failed_logins_are_rate_limited(auth_database) -> None:
    app, _engine, _password, _article_id = auth_database
    with TestClient(app, base_url=ORIGIN, client=("throttle", 50000)) as client:
        for _ in range(FAILURE_LIMIT):
            response = client.post(
                LOGIN,
                headers={"Origin": ORIGIN},
                json={"username": "测试管理员", "password": "wrong"},
            )
            assert response.status_code == 401
        blocked = client.post(
            LOGIN,
            headers={"Origin": ORIGIN},
            json={"username": "测试管理员", "password": "wrong"},
        )
        assert blocked.status_code == 429
        assert int(blocked.headers["Retry-After"]) > 0


def test_article_workflow_keeps_images_private_and_reserves_links(auth_database, tmp_path) -> None:
    app, _engine, password, _article_id = auth_database
    app = create_app(app.state.settings.model_copy(update={"media_root": tmp_path}))
    scheme = {"Origin": ORIGIN}
    public = "/api/v1/public/articles"
    media = "/api/v1/admin/media"
    with TestClient(app, base_url=ORIGIN, client=("writing", 50000)) as admin, TestClient(
        app, base_url=ORIGIN, client=("visitor", 50000)
    ) as visitor:
        login = admin.post(
            LOGIN, json={"username": "测试管理员", "password": password}, headers=scheme
        )
        assert login.status_code == 200
        headers = {**scheme, "X-CSRF-Token": admin.get(AUTH_SESSION).json()["csrf_token"]}
        image = BytesIO()
        with Image.new("RGB", (3, 2), "green") as sample:
            sample.save(image, format="PNG")
        uploaded = admin.post(media, files={"file": ("sample.png", image.getvalue(), "image/png")}, headers=headers)
        assert uploaded.status_code == 201, uploaded.text
        record = uploaded.json()
        assert visitor.get(record["url"]).status_code == 404
        assert visitor.get(f"{media}/{record['id']}/content").status_code == 401
        assert admin.get(f"{media}/{record['id']}/content").content == image.getvalue()
        missing_path = f"/media/{uuid4()}"
        bad_preview = admin.post(
            f"{ARTICLES}/preview", json={"body_md": f"![坏图]({missing_path})"}, headers=headers
        )
        assert bad_preview.json()["missing_images"] == [missing_path]

        payload = {
            "id": str(uuid4()),
            "title": "验证文章",
            "body_md": f"## 同名\n\n正文关键词\n\n## 同名\n\n![示例图]({record['url']})"
                       "\n\n```python\nprint(123)\n```\n\n<b>原始 HTML</b>",
            "cover_media_id": record["id"],
        }
        draft_response = admin.post(ARTICLES, json=payload, headers=headers)
        assert draft_response.status_code == 201, draft_response.text
        draft = draft_response.json()
        assert draft["status"] == "draft" and draft["slug"] is None
        assert admin.post(ARTICLES, json=payload, headers=headers).json()["id"] == draft["id"]
        assert f"{media}/{record['id']}/content" in draft["preview_html"]
        assert "<span class=" in draft["preview_html"]
        assert "&lt;b&gt;" in draft["preview_html"]
        assert len({entry["id"] for entry in draft["toc"]}) == 2
        assert visitor.get(public, params={"q": "正文关键词"}).json()["total"] == 0

        target = f"{ARTICLES}/{draft['id']}"
        failed_publication = admin.post(
            f"{target}/publish", json={"revision": draft["revision"], "content": {
                **payload, "body_md": f"![坏图]({missing_path})"
            }}, headers=headers
        )
        assert failed_publication.status_code == 400
        assert failed_publication.json()["details"] == [missing_path]
        assert admin.get(target).json()["body_md"] == payload["body_md"]

        publication = admin.post(f"{target}/publish", json={"revision": draft["revision"]}, headers=headers)
        assert publication.status_code == 200, publication.text
        state = publication.json()
        url = f"{public}/{state['slug']}"
        public_article = visitor.get(url).json()
        original_date = public_article["first_published_at"]
        assert record["url"] in public_article["body_html"]
        assert visitor.get(public, params={"q": "正文关键词"}).json()["items"][0]["slug"] == state["slug"]
        assert visitor.get(record["url"]).content == image.getvalue()
        assert admin.patch(target, json={**payload, "revision": draft["revision"]}, headers=headers).status_code == 409

        edit = admin.patch(
            target, json={**payload, "title": "更新后的标题", "revision": state["revision"]}, headers=headers
        )
        assert edit.status_code == 200, edit.text
        assert edit.json()["slug"] == state["slug"]
        assert visitor.get(url).json()["title"] == "更新后的标题"
        assert visitor.get(url).json()["first_published_at"] == original_date

        hidden = admin.post(f"{target}/unpublish", json={"revision": edit.json()["revision"]}, headers=headers)
        assert hidden.status_code == 200
        assert visitor.get(url).status_code == 404
        assert visitor.get(record["url"]).status_code == 404
        assert admin.get(f"{media}/{record['id']}/content").status_code == 200
        restored = admin.post(f"{target}/publish", json={"revision": hidden.json()["revision"]}, headers=headers)
        assert restored.status_code == 200
        assert visitor.get(url).json()["first_published_at"] == original_date

        (tmp_path / f"{record['id'].replace('-', '')}.png").unlink()
        assert visitor.get(url).status_code == 200
        assert visitor.get(record["url"]).status_code == 404
        blocked_update = admin.patch(
            target, json={**payload, "revision": restored.json()["revision"]}, headers=headers,
        )
        assert blocked_update.status_code == 400
        assert blocked_update.json()["details"] == [record["url"], f"封面 {record['url']}"]
        deleted = admin.request("DELETE", target, json={"revision": restored.json()["revision"]}, headers=headers)
        assert deleted.status_code == 204
        assert visitor.get(url).status_code == 404
        replacement = admin.post(
            ARTICLES, json={"title": payload["title"], "body_md": "另一篇文章"}, headers=headers
        ).json()
        republished = admin.post(
            f"{ARTICLES}/{replacement['id']}/publish",
            json={"revision": replacement["revision"]}, headers=headers,
        )
        assert republished.status_code == 200
        assert republished.json()["slug"] != state["slug"]


def test_public_navigation_and_about_follow_publication_and_permissions(auth_database, tmp_path) -> None:
    app, engine, password, _ = auth_database
    app = create_app(app.state.settings.model_copy(update={"media_root": tmp_path}))
    origin = {"Origin": ORIGIN}
    public = "/api/v1/public"
    management = "/api/v1/admin"
    with TestClient(app, base_url=ORIGIN, client=("navigation", 50000)) as admin, TestClient(
        app, base_url=ORIGIN, client=("visitor", 50000)
    ) as visitor:
        assert visitor.get(f"{management}/categories").status_code == 401
        assert visitor.get(f"{management}/about").status_code == 401
        assert visitor.get(f"{public}/about").json() == {"bio_html": "", "avatar_url": None, "links": []}
        assert admin.post(LOGIN, json={"username": "测试管理员", "password": password}, headers=origin).is_success
        headers = {**origin, "X-CSRF-Token": admin.get(AUTH_SESSION).json()["csrf_token"]}
        assert admin.post(f"{management}/categories", json={"name": "Notes"}, headers=origin).status_code == 403
        category_url = f"{management}/categories"
        tag_url = f"{management}/tags"
        category = admin.post(category_url, json={"name": "Notes"}, headers=headers).json()
        assert admin.post(category_url, json={"name": "ＮｏＴｅＳ"}, headers=headers).status_code == 409
        tag = admin.post(tag_url, json={"name": "写作"}, headers=headers).json()
        category_page = f"{public}/categories/{category['slug']}"
        tag_page = f"{public}/tags/{tag['slug']}"
        draft = admin.post(ARTICLES, json={
            "title": "归档边界示例", "body_md": "导航验收关键词", "category_id": category["id"], "tag_ids": [tag["id"]],
        }, headers=headers).json()
        assert admin.get(category_url).json()[0]["article_count"] == 1
        assert visitor.get(f"{public}/categories").json()[0]["article_count"] == 0
        assert visitor.get(category_page).json()["articles"]["total"] == 0
        assert visitor.get(tag_page, params={"page": "2"}).json()["details"] == {"total_pages": 1}

        article = f"{ARTICLES}/{draft['id']}"
        published = admin.post(f"{article}/publish", json={"revision": draft["revision"]}, headers=headers).json()
        with Session(engine) as session, session.begin():
            stored = session.scalar(select(Article).where(Article.title == draft["title"]))
            stored.first_published_at = datetime(2030, 12, 31, 16, 30, tzinfo=UTC)

        assert visitor.get(f"{public}/archive").json()[0] == {"year": 2031, "article_count": 1}
        assert visitor.get(f"{public}/articles", params={"year": "2030"}).json()["items"] == []
        assert visitor.get(f"{public}/articles", params={"year": "abcd"}).status_code == 400
        results = visitor.get(f"{public}/articles", params={
            "year": "2031", "category": category["slug"], "tag": tag["slug"], "q": "导航验收关键词",
        }).json()
        assert [item["slug"] for item in results["items"]] == [published["slug"]]
        for group, item, updated_name in [("categories", category, "学习笔记"), ("tags", tag, "实战")]:
            href = f"{management}/{group}/{item['id']}"
            renamed = admin.patch(href, json={"name": updated_name}, headers=headers).json()
            assert renamed["slug"] == item["slug"]
            record = visitor.get(f"{public}/{group}/{item['slug']}").json()
            assert record["taxonomy"]["name"] == updated_name
            assert record["articles"]["items"][0]["slug"] == published["slug"]

        hidden = admin.post(f"{article}/unpublish", json={"revision": published["revision"]}, headers=headers).json()
        assert visitor.get(tag_page).json()["articles"]["total"] == 0
        assert not any(item["year"] == 2031 for item in visitor.get(f"{public}/archive").json())
        assert admin.post(f"{article}/publish", json={"revision": hidden["revision"]}, headers=headers).is_success
        assert admin.delete(f"{category_url}/{category['id']}", headers=headers).status_code == 204
        assert admin.delete(f"{tag_url}/{tag['id']}", headers=headers).status_code == 204
        assert visitor.get(category_page).status_code == 404
        assert visitor.get(tag_page).status_code == 404
        detail = visitor.get(f"{public}/articles/{published['slug']}").json()
        assert detail["category"] is None and detail["tags"] == []

        image = BytesIO()
        with Image.new("RGB", (3, 2), "green") as sample:
            sample.save(image, format="PNG")
        record = admin.post(f"{management}/media", files={"file": ("avatar.png", image.getvalue(), "image/png")},
                            headers=headers).json()
        assert visitor.get(record["url"]).status_code == 404
        about = f"{management}/about"
        assert admin.put(about, json={"avatar_media_id": str(uuid4())}, headers=headers).status_code == 400
        assert admin.put(about, json={"links": [{"name": "坏链接", "url": "javascript:alert(1)"}]},
                         headers=headers).status_code == 422
        assert admin.put(about, json={
            "bio_md": "这里是 **作者介绍**。", "avatar_media_id": record["id"],
            "links": [{"name": "项目主页", "url": "https://example.com/projects"}],
        }, headers=headers).is_success
        profile = visitor.get(f"{public}/about").json()
        assert "<strong>作者介绍</strong>" in profile["bio_html"]
        assert profile["avatar_url"] == record["url"]
        assert profile["links"][0]["url"] == "https://example.com/projects"
        assert visitor.get(record["url"]).content == image.getvalue()
        assert admin.put(about, json={"bio_md": "更新后的介绍"}, headers=headers).is_success
        assert visitor.get(record["url"]).status_code == 404
