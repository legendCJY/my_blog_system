# 个人博客系统

这是一个在浏览器里使用的个人博客。管理员可以编辑和预览 Markdown、上传图片、发布或下架文章，并管理分类、标签和关于页。访客可以按分类、标签或首次发布年份浏览，也可以按标题和正文关键词搜索。

## 在 Windows 启动

需要 Python 3.13、uv、Node.js 22 和 Docker Desktop。在项目根目录首次运行以下命令，已有 `.env` 时沿用现有文件。

~~~powershell
if (!(Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
docker compose up -d --wait db
~~~

在一个 PowerShell 窗口中，进入 `backend` 启动 FastAPI。也可以在 PyCharm 选择 `backend/.venv/Scripts/python.exe` 并以 `backend` 为工作目录运行 Uvicorn。

~~~powershell
uv sync --locked --python 3.13
uv run alembic upgrade head
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
~~~

在另一个窗口中，进入 `frontend` 启动 React Router。

~~~powershell
npm.cmd ci
npm.cmd run dev
~~~

浏览器访问 [本地博客](http://127.0.0.1:5173/)。FastAPI 的 [存活检查](http://127.0.0.1:8000/health/live) 验证服务进程，[就绪检查](http://127.0.0.1:8000/health/ready) 会向 PostgreSQL 发出查询。

## 创建管理员

迁移完成后，在 `backend` 目录用 PowerShell 运行以下命令。按提示设置用户名和密码，密码长度至少 8 个字符。该命令用于初始化唯一管理员。

~~~powershell
uv run python -m app.cli create-admin
~~~

创建账号后，在浏览器打开 [管理员登录](http://127.0.0.1:5173/admin/login)。

## 写作与发布

1. 在「文章管理」点击「新建文章」，填写标题和 Markdown 正文。可以添加摘要，上传正文图片或封面。
2. 点击「预览当前内容」查看尚未保存的内容，也可以「保存草稿」后继续编辑。
3. 点击「发布文章」。访客可以从首页、搜索结果或文章链接打开正文。管理员可在编辑页复制链接、更新内容、下架或重新发布。
4. 本地图片保存到 `MEDIA_ROOT` 指定的目录。单张图片最大 4 MiB，支持 JPG、PNG、WebP 和 GIF。

## 分类、标签和关于页

- 登录后，用后台导航创建分类和标签。打开文章编辑页即可选择一个分类和多个标签。改名会保留原链接，确认删除后文章仍会保留。
- 在「关于页」上传头像、填写个人介绍或添加社交链接，保存后访客即可看到。
- 年份归档以首次发布时间及 `SITE_TIMEZONE` 为准，默认使用 `Asia/Shanghai`。

## 失效链接与编辑恢复

- 旧地址映射集中在 `frontend/app/lib/legacy-paths.server.ts`，例如 `/archives` 会以 HTTP 308 跳转到 `/archive`。
- 普通失效页面和失效文章会显示可取消的 8 秒倒计时。分类、标签和分页会显示对应的恢复入口。
- 编辑中的文章被删除时，可以复制正文或在确认后另存为新草稿。

## 验证

按启动说明安装两端依赖并启动本地 PostgreSQL。在 `frontend` 目录运行以下命令。首次运行时安装 Playwright 使用的 Chromium，之后直接执行检查。

~~~powershell
npx.cmd playwright install chromium
npm.cmd run check
~~~

`check` 会运行完整 pytest、前端类型检查和生产构建，最后在隔离的测试站点运行 Playwright。浏览器用例覆盖桌面与手机尺寸的写作和发布、主要 HTTP 状态、404 倒计时、缺图和编辑恢复。

- 只跑后端时，在 `backend` 执行 `uv run pytest --with-postgres`。
- 只跑浏览器时，在 `frontend` 执行 `npm.cmd run test:e2e`。电脑已有 Chrome 时，可设置 `$env:PLAYWRIGHT_CHANNEL = "chrome"`，跳过下载 Chromium 的步骤。
- PostgreSQL 测试使用本地 `.env` 的连接地址，也可通过 `TEST_DATABASE_URL` 指定本机测试库。每次运行使用独立的临时 schema，浏览器测试会自动启动临时服务并清理测试管理员、文章和图片，无需启动日常前后端。
