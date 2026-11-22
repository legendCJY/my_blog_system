import { data, Form, Link, useLocation } from "react-router";
import type { Route } from "./+types/admin-articles";
import { adminRequest, loginPageFor, requireAdminSession } from "../lib/admin.server";
import { articleDate, statusNames, type ArticleStatus } from "../lib/articles";
import { AdminNavigation } from "../components/admin-navigation";
import { articlePageUrl, ArticleListError } from "../components/public-article-list";

type ArticleList = {
  items: Array<{ id: string; title: string; status: ArticleStatus; updated_at: string }>;
  page: number;
  total_pages: number;
};

export function meta(): Route.MetaDescriptors {
  return [{ title: "文章管理 · 个人博客" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdminSession(request);
  const params = new URL(request.url).searchParams;
  const page = params.get("page") ?? "1";
  const status = params.get("status") ?? "";
  const query = new URLSearchParams({ page });
  if (status) query.set("status", status);
  const response = await adminRequest(request, `api/v1/admin/articles?${query}`);
  if (response.status === 401) throw loginPageFor(request);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw data({ code: error.code, total_pages: error.details?.total_pages }, { status: response.status });
  }
  const articles = (await response.json()) as ArticleList;
  return { admin, articles, status };
}

export default function AdminArticles({ loaderData }: Route.ComponentProps) {
  const { admin, articles, status } = loaderData;
  const pageLink = (page: number) => articlePageUrl("/admin/articles", page, { status });
  return (
    <section className="listing-page">
      <AdminNavigation />
      <div className="admin-heading">
        <h1>文章管理</h1>
        <Form action="/admin/logout" method="post" reloadDocument className="admin-actions">
          <Link className="button button-primary" to="/admin/articles/new">新建文章</Link>
          <span>{admin.username}</span>
          <input type="hidden" name="csrf_token" value={admin.csrf_token} />
          <button className="button button-outline" type="submit">退出登录</button>
        </Form>
      </div>
      <Form method="get" className="admin-filter">
        <label>文章状态 <select key={status} name="status" defaultValue={status}>
          <option value="">全部状态</option>
          {Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <button type="submit" className="button button-outline">筛选</button>
      </Form>
      {articles.items.length ? (
        <ul className="admin-article-list">
          {articles.items.map((article) => (
            <li key={article.id}>
              <div>
                <Link to={`/admin/articles/${article.id}/edit`}>{article.title || "未命名文章"}</Link>
                <div className="article-meta">
                  <span>{statusNames[article.status]}</span>
                  <time dateTime={article.updated_at}>{articleDate(article.updated_at)}</time>
                </div>
              </div>
              <Link to={`/admin/articles/${article.id}/preview`}>预览</Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <h2>暂无文章</h2>
        </div>
      )}
      {articles.total_pages > 1 && (
        <nav className="page-actions" aria-label="文章列表分页">
          {articles.page > 1 && <Link to={pageLink(articles.page - 1)}>上一页</Link>}
          <span>第 {articles.page} 页，共 {articles.total_pages} 页</span>
          {articles.page < articles.total_pages && <Link to={pageLink(articles.page + 1)}>下一页</Link>}
        </nav>
      )}
    </section>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { search } = useLocation();
  const status = new URLSearchParams(search).get("status") ?? "";
  return <ArticleListError error={error} where="/admin/articles" filters={{ status }} />;
}
