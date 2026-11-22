# 个人博客系统实施计划

需求基线为 [《个人博客系统产品需求文档》v1.3](<个人博客系统 PRD.md>)。首版交付单作者博客，包括访客前台、作者后台、文章发布和查找，以及 404 处理流程。本地在 Windows 开发，用 Docker Desktop 启动 PostgreSQL。生产部署到 Vercel，连接托管 PostgreSQL 和对象存储。

## 1. 技术选型

| 层级 | 选型 | 用途 |
| --- | --- | --- |
| 后端 | Python 3.13、FastAPI、Pydantic v2、Uvicorn | 用 PyCharm 开发和调试。FastAPI 提供接口、校验数据、管理登录与文章状态，并输出 OpenAPI。 |
| 前端 | TypeScript、React 19、React Router 7 Framework Mode、Vite 8 | 页面和后台表单共用 React 组件。开启服务端渲染（SSR），由服务器输出正文、分享信息及真实的 HTTP 404。React Router 使用支持 Vite 8 的 7.14 或更新的 7.x 版本，并启用 Vercel 官方适配。 |
| 样式 | 原生 CSS、CSS Modules | 用变量管理间距、颜色与排版，公共页面和后台共用按钮、表单、提示、空状态及响应式布局。 |
| 数据库 | PostgreSQL 18、SQLAlchemy 2.x、psycopg 3、Alembic | 本地用 Docker Desktop 和 Docker Compose，生产首选 Neon 托管 PostgreSQL，两个环境使用同一数据库主版本。Alembic 管理建表和升级。 |
| Markdown 与图片 | markdown-it-py、Pygments、nh3、Pillow | 后端统一渲染 Markdown、处理代码高亮和 HTML 清洗，并校验上传的图片。 |
| 图片存储 | 本地文件目录、Vercel Blob 私有存储 | 本地图片存到项目运行目录，线上图片保存在 Blob。FastAPI 统一处理图片访问权限。 |
| 测试与部署 | pytest、HTTPX、Playwright、Vercel Services | 验证后端规则、浏览器流程和 HTTP 状态。Vercel 在同一项目部署 React SSR 和 FastAPI，提供统一域名与 HTTPS。 |

TypeScript 用于前端的页面数据、编辑表单和 API 类型。React Router 主版本选 7，以匹配 Vercel 官方适配包声明的版本范围。初始化时锁定兼容的稳定补丁版，提交 `package-lock.json` 和 `uv.lock`。Vercel 和本地从相同的依赖清单构建。 [Vercel React Router 文档](https://vercel.com/docs/frameworks/frontend/react-router) · [官方适配包依赖](https://github.com/vercel/vercel/blob/main/packages/react-router/package.json#L60) · [React Router 更新记录](https://reactrouter.com/start/changelog) · [Vercel Python 依赖](https://vercel.com/docs/functions/runtimes/python#dependencies) · [Neon PostgreSQL 版本](https://neon.com/docs/postgresql/postgres-version-support)

此前已检测到本机有 Python 3.13.3、Node.js 22.22.0、npm 10.9.4 和 Docker Compose。开始本地联调时，启动 Docker Desktop 并用 `docker info` 确认引擎已连接。线上 Python 同样锁定为 3.13，前端运行环境选 Node.js 22。 [Vercel FastAPI 部署指南](https://vercel.com/kb/guide/ship-a-fastapi-app-on-vercel)

## 2. 架构与开发规范

~~~text
本地 Windows
浏览器 → Vite / React Router SSR → FastAPI（PyCharm / Uvicorn）
                                    ├─ PostgreSQL（Docker Desktop）
                                    └─ 本地图片目录

线上 Vercel（同一 HTTPS 域名）
  ├─ 网页和前端静态资源 ──→ React Router SSR
  │                              └─ Vercel 内部服务绑定 ─┐
  └─ /api、/api/*、/media/* ─→ FastAPI Function ←─────────┘
                                 ├─ 托管 PostgreSQL
                                 └─ 私有 Vercel Blob
~~~

- **职责与数据流**。React Router 的服务端 `loader` 在渲染前读取 FastAPI 的数据和状态。本地调用回环地址，线上使用 Vercel 注入的内部服务地址。浏览器的后台保存、预览和上传通过同域 API 提交。FastAPI 负责权限、校验和状态变更，并以 OpenAPI 提供生成 TypeScript 类型所需的接口定义。 [Vercel 服务绑定](https://vercel.com/docs/services/bindings)
- **后端分层**。路由解析请求并返回响应，服务层实现发布、下架和删除等规则，查询层统一组织公开与后台查询，数据模型和迁移定义数据库约束。为同步 SQLAlchemy 会话使用同步 FastAPI 路由，每个请求使用独立会话。
- **事务与并发**。一次发布或更新在同一事务内写入文章、固定链接和关联。更新、下架、重新发布和删除携带文章版本号，旧版本返回 409，记录缺失返回 404。编辑页保留输入，提示重新载入或另存草稿。公开列表、详情、归档和搜索共用已发布过滤条件。
- **登录和会话**。通过管理命令初始化唯一管理员，密码用 Argon2id 哈希。浏览器使用同域会话 Cookie，启用 `HttpOnly`、`SameSite=Lax`，预览和生产环境启用 `Secure`。数据库保存会话令牌摘要与过期时间，退出后作废会话。登录限流状态使用数据库，以便在多个函数实例间生效。写入请求验证来源和 CSRF 令牌。后台 SSR 只向内部 API 转发必要的会话信息，登录回跳地址限定在站内受保护路径。
- **内容渲染与访问**。预览和发布共用 Markdown 渲染服务，禁用原始 HTML，并清洗输出；生成去重的标题锚点、目录、代码高亮和搜索文本。文章资源、管理页面与预览的缓存策略以状态及时生效为准，首版对动态页面、私有数据和可撤下的媒体响应采用 `Cache-Control: no-store`。带内容指纹的前端静态资源可以长期缓存。
- **图片存储**。本地文件与线上私有 Blob 使用同一存储接口和不可变的存储键。上传时校验真实格式、像素尺寸和大小。首版单张图片限制为 4 MiB，给 Vercel Functions 的 4.5 MB 请求体上限留出表单开销。文件写入成功后登记元数据，登记失败时清理未引用对象。Markdown 保存站内稳定引用。FastAPI 校验图片是否被当前已发布文章或公开关于页引用，再通过 `/media/{id}` 返回图片；草稿图片使用管理员接口读取。发布前发现缺失时，提示作者替换或移除，草稿仍可保存。 [Vercel Functions 大小限制](https://vercel.com/docs/functions/limitations#request-body-size) · [Vercel Blob 私有存储](https://vercel.com/docs/vercel-blob/private-storage)
- **API 约定**。JSON 字段使用 `snake_case`。列表返回 `items`、`page`、`page_size`、`total`、`total_pages`，首页和公开列表默认每页 10 条。时间以 UTC 存储，API 使用带时区的 ISO 8601，按 `Asia/Shanghai` 显示日期并划分年份归档。错误包含 `code`、`message`，需要时包含 `details`，分页参数错误统一为 400。

页面的 404 由服务器在发送 HTML 前确定。React Router 路由在查找失败时抛出带 HTTP 状态的响应，由错误边界渲染对应页面。E01 的未知前台页面和 E02 至 E05 的失效文章启用浏览器端 8 秒倒计时，其余情况使用 PRD 对应的恢复入口。 [React Router 服务端渲染](https://reactrouter.com/start/framework/rendering) · [React Router 错误边界](https://reactrouter.com/how-to/error-boundary)

## 3. 项目目录结构

以下目录随实现步骤逐步创建。

~~~text
个人博客/
├── 个人博客系统 PRD.md
├── plan.md
├── README.md
├── .env.example
├── .gitignore
├── compose.yaml                         # Docker Desktop 中的本地 PostgreSQL
├── vercel.json                          # 线上服务、同域路由和内部绑定
├── backend/
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── alembic.ini
│   ├── migrations/
│   ├── app/
│   │   ├── main.py                      # FastAPI 应用及路由注册
│   │   ├── config.py
│   │   ├── api/                         # public、admin、auth、media、health
│   │   ├── db/                          # 会话、模型和查询
│   │   ├── schemas/                     # Pydantic 输入输出
│   │   ├── services/                    # 文章、会话、Markdown、图片
│   │   └── cli.py                       # 初始化管理员
│   └── tests/
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.ts
│   ├── react-router.config.ts
│   ├── app/
│   │   ├── root.tsx
│   │   ├── routes.ts
│   │   ├── routes/                      # 前台、后台和失效地址
│   │   ├── components/                  # 排版、编辑器、表单和恢复提示
│   │   ├── lib/                         # API、生成类型和日期工具
│   │   └── styles/
│   └── tests/e2e/
└── deploy/
    └── scripts/                         # 数据库迁移
~~~

## 4. 路由设计

### 4.1 网页路由

| 路径 | 说明 |
| --- | --- |
| `/` | 首页，可用 `?page=2` 分页，按首次发布时间倒序。 |
| `/articles/:slug` | 文章详情，以及目录、分享信息和封面。 |
| `/categories`、`/categories/:slug` | 全部分类、指定分类的文章。 |
| `/tags`、`/tags/:slug` | 全部标签、指定标签的文章。 |
| `/archive`、`/archive/:year` | 年份索引、指定年份的文章。 |
| `/search` | 站内搜索。查询参数 `q` 接收搜索词，支持中文。`page` 指定页码，默认第 1 页。 |
| `/about` | 作者介绍、头像和社交链接。 |
| `/admin/login` | 管理员登录。 |
| `/admin`、`/admin/articles` | 后台入口转到文章管理，支持状态筛选。 |
| `/admin/articles/new`、`/admin/articles/:id/edit` | 新建或编辑文章，保留用户的表单输入。 |
| `/admin/articles/:id/preview` | 预览已保存内容；编辑器还可以预览未保存的当前内容。 |
| `/admin/categories`、`/admin/tags`、`/admin/about` | 管理分类、标签与关于页。 |
| 未匹配路径 | 已登记的旧页面直接跳到对应新页面；其他路径在原地址返回 404。前台与后台使用各自的恢复入口。 |

搜索提交时用 `URLSearchParams` 编码查询参数。例如搜索「博客」时，请求地址为 `/search?q=%E5%8D%9A%E5%AE%A2&page=1`。网页加载器将搜索参数传给公开文章 API，FastAPI 从查询参数中读取解码后的搜索词。 [URL 编码规范](https://url.spec.whatwg.org/#urlsearchparams) · [FastAPI 查询参数](https://fastapi.tiangolo.com/tutorial/query-params/)

### 4.2 FastAPI 路由

以下 JSON API 统一加前缀 `/api/v1`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/public/articles` | 公开文章列表和搜索，可传 `category`、`tag`、`year`、`q`、`page`。 |
| GET | `/public/articles/{slug}` | 查询已发布文章，缺失或不可公开时统一返回 404。 |
| GET | `/public/categories`、`/public/categories/{slug}`、`/public/tags`、`/public/tags/{slug}` | 查询分类、标签及对应文章分页。存在但无公开文章时返回空列表。 |
| GET | `/public/archive`、`/public/about` | 查询已发布文章的归档年份和关于页。指定年份的文章从公开文章列表获取。 |
| POST | `/auth/login`、`/auth/logout` | 建立和撤销会话，设置或清除 Cookie。 |
| GET | `/auth/session` | 检查会话，返回管理页面所需的身份和 CSRF 信息。 |
| GET、POST | `/admin/articles` | 查询后台文章、按状态筛选，或建立草稿。新建文章的发布按钮先建立草稿再提交发布；阶段失败时可从草稿继续。 |
| GET、PATCH、DELETE | `/admin/articles/{id}` | 读取文章、保存编辑或删除。已发布文章的 PATCH 对应页面上的「更新」。 |
| POST | `/admin/articles/{id}/publish`、`/admin/articles/{id}/unpublish` | 发布、重新发布或下架。 |
| POST | `/admin/articles/preview` | 渲染编辑器中的 Markdown 和私有图片，返回 HTML 与目录。 |
| GET、POST | `/admin/categories`、`/admin/tags` | 查询和新增分类、标签。列表包含关联文章数量。 |
| PATCH、DELETE | `/admin/categories/{id}`、`/admin/tags/{id}` | 改名或删除分类、标签。 |
| GET、PUT | `/admin/about` | 读取与更新关于页。 |
| POST、GET | `/admin/media`（上传）、`/admin/media/{id}/content`（读取） | 保存上传图片，或在后台和预览中读取私有图片。 |

公开图片以 `GET /media/{id}` 提供，文件缺失时返回 404。FastAPI 的 `/health/live` 和 `/health/ready` 供本地检查或线上内部服务调用。Vercel 将 `/api`、`/api/*` 和 `/media/*` 路由到 FastAPI，并保留原请求路径。接口的 401、404、405 和 5xx 按原状态返回给调用方，网页加载器根据场景呈现对应提示。

## 5. 数据库 Schema

应用时间字段统一用 `timestamptz`，文章、媒体和分类等实体使用 UUID。首个 Alembic 迁移创建以下表及约束。

| 表 | 主要字段与约束 |
| --- | --- |
| `admins` | `id smallint PK CHECK (id = 1)`、`username UNIQUE NOT NULL`、`password_hash NOT NULL`、`created_at`。 |
| `sessions` | `token_hash PK`、`admin_id FK`、`csrf_token`、`created_at`、`expires_at`。过期列建索引，注销时删除记录。 |
| `login_attempts` | `scope_key PK`、`attempt_count`、`window_started_at`、`blocked_until NULL`。数据库原子更新计数，按时间清理过期记录。 |
| `articles` | `id PK`、`title`、`body_md`、`body_html`、`toc jsonb`、`search_text`、`summary NULL`、`cover_media_id FK NULL`、`category_id FK NULL`、`status`、`revision int`、`first_published_at NULL`、`created_at`、`updated_at`、`content_updated_at NULL`。状态限定为 `draft`、`published`、`unpublished`，公开状态要求首次发布时间非空。 |
| `article_links` | `slug text PK`、`article_id FK UNIQUE NULL`、`created_at`。文章删除时外键设为空，原 slug 仍被占用。 |
| `categories`、`tags` | 各含 `id PK`、`name`、规范化名称 `normalized_name UNIQUE`、`slug UNIQUE`、`created_at`、`updated_at`。改名只修改名称字段。 |
| `article_tags` | `article_id FK`、`tag_id FK`，联合主键。删除文章或标签时清理相应关联。 |
| `media` | `id PK`、`storage_key UNIQUE`、`original_name`、`mime_type`、`bytes`、`width`、`height`、`created_at`。同一字段保存本地文件键或线上 Blob 路径。 |
| `article_media` | `article_id FK`、`media_id FK`，联合主键，记录正文中可识别的站内图片。封面通过 `articles.cover_media_id` 关联。 |
| `about_page` | `id smallint PK CHECK (id = 1)`、`bio_md`、`bio_html`、`avatar_media_id FK NULL`、`links jsonb`、`updated_at`。社交链接项的名称和 URL 由接口校验。 |

约束与查询规则

- 首次发布在同一事务内分配唯一 slug、写入首次发布时间并更新状态。标题生成简洁 slug，遇到冲突追加后缀；删除文章后，保留链接记录。改标题、下架和重新发布均沿用原链接及首次发布时间。
- 分类外键使用 `ON DELETE SET NULL`，标签及正文图片关联在相应记录删除时按约束清理。共享图片独立存储，删除文章不联动删除文件。媒体删除或清理前确认正文、封面和头像均已解除引用。
- 为已发布文章建立 `(first_published_at DESC, id DESC)` 的部分索引，补充分类、标签和媒体关联的反向查找索引。分页按发布时间和 ID 稳定排序。归档年份按站点时区计算起止时间，再按时间范围查询。
- 搜索先采用参数化的关键词子串匹配，覆盖标题和从 Markdown 提取的正文纯文本，支持中文连续词和英文大小写无关匹配。转义用户输入中的通配符。首版使用 PostgreSQL 提供搜索，查询规模增长后再根据实际耗时评估索引或分词方案。

## 6. 实现步骤

| 步骤 | 要做的工作 | 验收后进入下一步 |
| --- | --- | --- |
| 1. 骨架与连通 | 初始化两个应用、开发代理、健康检查和本地 PostgreSQL 容器。用最小 SSR 页面验证 FastAPI 调用。在首次 Vercel 预览部署中验证服务绑定、同域 API 和实际 HTTP 404。 | Windows 上的页面、API 和数据库连通。Vercel 预览确认前后端框架及路由配置可用。 |
| 2. 数据库与登录 | 写首个迁移、会话表、管理员初始化命令和登录页。打通 Cookie、授权校验、注销和预览登录回跳。 | 空数据库可迁移，管理员可登录，未登录访问后台按 401 或登录跳转处理。 |
| 3. 写作与发布 | 实现文章列表、Markdown 编辑、站内图片上传、预览、保存草稿、发布、更新、下架、重新发布和删除确认。加上固定链接和版本冲突处理。 | 带图片和代码的文章能从草稿发布。改标题后原链接可访问，下架后立即不可公开。 |
| 4. 公开阅读与导航 | 实现响应式首页、文章详情、分类、标签、归档、搜索、关于页和分享信息。补齐后台分类、标签和关于页设置。 | 手机端可查找和阅读，搜索只命中已发布正文，改名不导致分类或标签链接失效。 |
| 5. 404 与恢复交互 | 加入旧地址映射、通用错误页、8 秒倒计时、取消与搜索入口。补充分类标签兜底、分页恢复、缺图占位和后台输入保留。 | 对照 PRD 的 E01–E10 逐项验收；检查禁用脚本后手动入口也能用。 |
| 6. 自动化与发布检查 | 用 pytest 覆盖会话、状态变更、稳定链接、公开图片权限和状态码。用 Playwright 验证桌面和手机的写作至发布流程，以及 404 的倒计时和恢复操作。 | Python 与前端检查通过。通过真实 HTTP 请求确认文章 404、旧址跳转、空列表 200、分页 400 和接口权限状态。 |
| 7. Vercel 部署与上线 | 配置预览和生产环境，连接各自的托管 PostgreSQL 和私有 Blob。执行数据库迁移和管理员初始化后发布应用。 | 从线上域名验证 HTTPS、公开文章、后台登录、草稿图片权限和真实 HTTP 404。 |

## 7. 本地开发与部署

### GitHub 版本管理

项目的 `origin` 为 [legendCJY/my_blog_system](https://github.com/legendCJY/my_blog_system)。代码和 Markdown 更新通过检查后，保留在本地工作区供用户确认。收到用户明确要求提交到 GitHub 后，按本次确认的范围提交到 `main` 并推送至 `origin/main`。真实环境配置、密钥和本地数据保存在 Git 之外。

### Windows 与 PyCharm

1. 骨架建立后，准备 `uv`，并在 `backend` 运行 `uv sync --locked --python 3.13` 创建虚拟环境和安装依赖。在 PyCharm 打开项目根目录，选择 `backend/.venv/Scripts/python.exe`。运行配置以 `backend` 为工作目录，用 Uvicorn 启动 `app.main:app`，监听 `127.0.0.1:8000`。
2. 启动 Docker Desktop，在根目录运行 `docker compose up -d db`。Compose 运行 PostgreSQL 18，端口只绑定本机回环地址，数据保存到命名卷。数据库连通后，在 `backend` 运行 `uv run alembic upgrade head`，再通过项目管理命令交互式创建本地管理员。
3. 在 `frontend` 运行 `npm ci` 和 `npm run dev`。浏览器打开 `http://localhost:5173`，Vite 将 `/api` 和 `/media` 转发到本地 FastAPI，SSR 加载器通过 `INTERNAL_API_URL=http://127.0.0.1:8000` 访问后端。上传图片使用本地 `MEDIA_ROOT` 目录。
4. 在 `.env.example` 说明 `DATABASE_URL`、`PUBLIC_SITE_URL`、`INTERNAL_API_URL`、`MEDIA_ROOT`、`MEDIA_BACKEND`、`SESSION_TTL_SECONDS`、`COOKIE_SECURE` 和 `SITE_TIMEZONE`。本地使用 Docker 中的数据库地址和 `MEDIA_BACKEND=local`。真实配置、运行文件与媒体排除出版本控制。

### Vercel 预览与生产部署

1. **部署入口**。在 Vercel 导入代码仓库。用根目录 `vercel.json` 声明 `web` 和 `api` 两个服务，构建目录分别为 `frontend/` 和 `backend/`，FastAPI 入口为 `app.main:app`。先匹配 `/api`、`/api/*` 和 `/media/*` 到 `api`，其余网页与资源交给 `web`。在 `web` 声明到 `api` 的服务绑定，Vercel 在运行时注入 `INTERNAL_API_URL`。Vercel Services 当前为 Beta，先在骨架预览中验证 SSR、同域路由和内部绑定。如果绑定方案无法通过验证，使用同仓库的两个 Vercel 项目，并由前端项目将 API 和媒体路径转发到对应环境的后端项目。 [Vercel Services](https://vercel.com/docs/services) · [服务绑定](https://vercel.com/docs/services/bindings) · [同域项目转发](https://vercel.com/docs/monorepos/monorepo-faq)
2. **数据与环境变量**。为 Preview 和 Production 配置独立的 PostgreSQL 数据库或分支、私有 Blob 和管理员数据。线上 API 用带 TLS 的池化 `DATABASE_URL`，数据库迁移使用直连 `DATABASE_DIRECT_URL`。后端使用 `MEDIA_BACKEND=blob` 和对应的 Blob 凭据，浏览器访问同域路径。生产环境的 `PUBLIC_SITE_URL` 指向正式域名，预览环境使用对应的 Vercel 预览地址，两者分别校验登录与写入请求来源。 [Vercel 环境配置](https://vercel.com/docs/deployments/environments) · [Vercel 接入 PostgreSQL](https://vercel.com/docs/postgres) · [Neon 连接池](https://neon.com/docs/connect/connection-pooling)
3. **迁移与发布**。先用直连地址迁移目标数据库，首次上线时运行管理员初始化命令。迁移由独立命令执行，应用函数只处理请求。先在 Preview 完成登录、发布、下架、图片上传和 404 验收，再发布 Production 并配置正式域名与 HTTPS。后续数据库变更保持前后版本兼容，生产迁移完成后再切换应用版本。 [Vercel 发布流程](https://vercel.com/docs/deployments/promoting-a-deployment)
4. **上线检查与应用回退**。从正式域名验证首页、搜索、公开文章、固定链接、后台 Cookie、草稿图片权限和缺图占位。直接请求下架文章，检查原地址先返回 HTTP 404，浏览器再执行可取消的 8 秒倒计时。应用发布出问题时，确认当前数据库 Schema 与上一版应用兼容后，再回退 Vercel 部署。日志记录请求状态和错误信息，排除密码、会话令牌和草稿正文。 [Vercel 部署回退](https://vercel.com/docs/instant-rollback)
