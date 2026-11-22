import argparse
from getpass import getpass

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import Admin
from app.db.session import get_engine
from app.services.auth import password_hasher


def create_admin() -> None:
    settings = Settings()
    database_url = settings.database_direct_url or settings.database_url
    if not database_url:
        raise SystemExit("请先设置 DATABASE_DIRECT_URL 或 DATABASE_URL。")

    engine = get_engine(database_url)
    with Session(engine) as db:
        if db.get(Admin, 1) is not None:
            raise SystemExit("管理员账号已存在。")

    username = input("管理员用户名：").strip()
    if not username or len(username) > 120:
        raise SystemExit("用户名长度应为 1 到 120 个字符。")

    password = getpass("管理员密码：")
    if not 8 <= len(password) <= 1024:
        raise SystemExit("密码长度应为 8 到 1024 个字符。")
    if password != getpass("再次输入密码："):
        raise SystemExit("两次密码不一致。")

    try:
        with Session(engine) as db, db.begin():
            db.add(Admin(id=1, username=username, password_hash=password_hasher.hash(password)))
    except IntegrityError:
        raise SystemExit("管理员账号已存在。") from None

    print("管理员账号已创建。")


def main() -> None:
    parser = argparse.ArgumentParser(description="个人博客后台管理")
    parser.add_argument("command", choices=["create-admin"])
    parser.parse_args()
    create_admin()


if __name__ == "__main__":
    main()
