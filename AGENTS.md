# 个人博客系统开发指南

本文件适用于整个仓库。开始实现前，先读 [《个人博客系统 PRD》](<个人博客系统 PRD.md>) 和 [实施计划](plan.md)。以 PRD 确定功能范围与验收标准，以实施计划确定技术选型、路由、数据库设计和开发顺序。用户确认新的需求或技术决策后，同步修订相关文档。

## 开发环境与实现

- 本地使用 Windows 和 PowerShell。后端为 Python 3.13 和 FastAPI，用 PyCharm 调试，依赖通过 `uv` 管理。前端为 TypeScript、React 和 React Router Framework Mode，通过 npm 启动。
- 本地 PostgreSQL 18 由 Docker Desktop 运行，在仓库根目录执行 `docker compose up -d db`。前端和后端在 Windows 本地运行。线上部署到 Vercel，使用托管 PostgreSQL 和私有 Vercel Blob。
- 按 `plan.md` 完成当前阶段，再从实际入口验证。优先复用现有的路由、服务和组件。数据库结构变化通过 Alembic 迁移，接口变更同步更新受影响的前端调用和类型。
- 维护文章的固定链接和发布状态。公开查询只展示已发布内容，草稿预览和私有图片由后端校验管理员权限。

## 验收

- 验证本次改动涉及的 PRD 场景。后端使用 pytest，页面流程使用 Playwright，具体命令以仓库现有配置为准。文档改动检查文件引用、需求范围与计划是否一致。
- 修改路由或错误处理时，检查 HTTP 响应状态和页面行为。普通失效页面及文章先返回真实的 HTTP 404，再执行可取消的 8 秒倒计时。关闭脚本时，返回首页和搜索入口仍可使用。
- 交付时说明已完成的改动、已执行的检查和仍待验证的事项。

## GitHub 版本管理

- 远程仓库为 `https://github.com/legendCJY/my_blog_system.git`，通过 `origin/main` 管理版本。每次完成并检查通过后，审阅变更范围，提交本次相关文件并推送。
- `.env.example` 仅记录配置名和示例值。实际密钥、本地环境文件、数据库数据及上传文件放在版本控制之外。
