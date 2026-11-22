import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from time import monotonic, sleep
from uuid import uuid4

import httpx
import uvicorn
from PIL import Image
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import Admin
from app.db.session import get_engine
from app.main import create_app
from app.services.auth import password_hasher
from tests.database import BACKEND_DIR, configured_database_url, migrated_schema

FRONTEND_DIR = BACKEND_DIR.parent / "frontend"
VITE_CLI = FRONTEND_DIR / "node_modules/@react-router/dev/bin.js"
PLAYWRIGHT_CLI = FRONTEND_DIR / "node_modules/@playwright/test/cli.js"


def wait_for_server(url: str, process: subprocess.Popen | None = None) -> None:
    deadline = monotonic() + 20
    with httpx.Client(timeout=2, trust_env=False) as client:
        while monotonic() < deadline and (process is None or process.poll() is None):
            try:
                if client.get(url).status_code == 200:
                    return
            except httpx.TransportError:
                pass
            sleep(0.2)
    raise RuntimeError(f"Test server did not become ready at {url}.")


def run_browser_tests(dsn: str, directory: Path, node: str, args: list[str]) -> int:
    username = "playwright-admin"
    password = uuid4().hex
    with Session(get_engine(dsn)) as session, session.begin():
        session.add(Admin(id=1, username=username, password_hash=password_hasher.hash(password)))

    media_root = directory / "media"
    sample = directory / "sample.png"
    with Image.new("RGB", (96, 96), "green") as image:
        image.save(sample)

    with socket.socket() as api_socket, socket.socket() as web_port_reservation:
        api_socket.bind(("127.0.0.1", 0))
        web_port_reservation.bind(("127.0.0.1", 0))
        api_port = api_socket.getsockname()[1]
        web_port = web_port_reservation.getsockname()[1]
        api_origin = f"http://127.0.0.1:{api_port}"
        web_origin = f"http://127.0.0.1:{web_port}"

        settings = Settings(
            _env_file=None, database_url=dsn, public_site_url=web_origin, media_root=media_root,
            media_backend="local", cookie_secure=False,
        )
        server = uvicorn.Server(uvicorn.Config(create_app(settings), host="127.0.0.1", port=api_port, log_level="warning"))
        api = Thread(target=server.run, kwargs={"sockets": [api_socket]}, daemon=True)
        api.start()
        try:
            wait_for_server(f"{api_origin}/health/ready")
            web_port_reservation.close()
            web_env = dict(os.environ, INTERNAL_API_URL=api_origin)
            log_path = directory / "web.log"
            with log_path.open("w", encoding="utf-8") as log:
                web = subprocess.Popen(
                    [node, str(VITE_CLI), "dev", "--port", str(web_port)],
                    cwd=FRONTEND_DIR, env=web_env, stdout=log, stderr=subprocess.STDOUT,
                )
                try:
                    wait_for_server(f"{web_origin}/", web)
                    test_env = dict(
                        os.environ, BLOG_E2E_ORIGIN=web_origin, BLOG_E2E_USERNAME=username,
                        BLOG_E2E_PASSWORD=password, BLOG_E2E_IMAGE=str(sample), BLOG_E2E_MEDIA_DIR=str(media_root),
                    )
                    return subprocess.call(
                        [node, str(PLAYWRIGHT_CLI), "test", *args], cwd=FRONTEND_DIR, env=test_env,
                    )
                except RuntimeError:
                    print(log_path.read_text(encoding="utf-8", errors="replace"))
                    raise
                finally:
                    if web.poll() is None:
                        web.terminate()
                        web.wait(timeout=10)
        finally:
            server.should_exit = True
            api.join(timeout=10)


def main() -> int:
    node = shutil.which("node")
    if not node or not VITE_CLI.is_file() or not PLAYWRIGHT_CLI.is_file():
        print("Install Node.js and run npm ci in frontend before starting the browser tests.", file=sys.stderr)
        return 1

    with TemporaryDirectory(prefix="blog-e2e-") as directory, migrated_schema(configured_database_url()) as dsn:
        return run_browser_tests(dsn, Path(directory), node, sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
