import { isRouteErrorResponse, Link } from "react-router";
import { articleDate, type PublicArticlePage } from "../lib/articles";

export function articlePageUrl(where: string, page: number, filters: Record<string, string> = {}) {
  const params = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return `${where}?${params}`;
}

export function PublicArticleList({ articles, where, query }: {
  articles: PublicArticlePage; where: string; query: string;
}) {
  return (
    <>
      <ul className="public-article-list">
        {articles.items.map((article) => (
          <li key={article.slug}>
            <div className="article-meta">
              <time dateTime={article.first_published_at}>{articleDate(article.first_published_at, article.site_timezone)}</time>
              {article.category && <Link to={`/categories/${encodeURIComponent(article.category.slug)}`}>{article.category.name}</Link>}
            </div>
            <h2><Link to={`/articles/${encodeURIComponent(article.slug)}`}>{article.title}</Link></h2>
            {article.summary && <p>{article.summary}</p>}
          </li>
        ))}
      </ul>
      {articles.total_pages > 1 && (
        <nav className="page-actions" aria-label="公开文章分页">
          {articles.page > 1 && <Link to={articlePageUrl(where, articles.page - 1, { q: query })}>上一页</Link>}
          <span>第 {articles.page} 页，共 {articles.total_pages} 页</span>
          {articles.page < articles.total_pages && <Link to={articlePageUrl(where, articles.page + 1, { q: query })}>下一页</Link>}
        </nav>
      )}
    </>
  );
}

export function ArticleListError({ error, where, filters }: {
  error: unknown; where: string; filters?: Record<string, string>;
}) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    const page = error.data?.total_pages ?? 1;
    return (
      <section className="message-page">
        <h1>这一页不存在</h1>
        <p>当前只有 {page} 页。</p>
        <Link className="button button-primary" to={articlePageUrl(where, page, filters)}>查看第 {page} 页</Link>
      </section>
    );
  }
  if (isRouteErrorResponse(error) && error.status === 400) {
    const invalidQuery = error.data?.code === "invalid_query";
    const invalidStatus = error.data?.code === "invalid_status";
    const title = invalidQuery ? "搜索关键词过长" : invalidStatus ? "文章状态无效" : "页码无效";
    const resetPath = invalidQuery || invalidStatus ? where : articlePageUrl(where, 1, filters);
    return (
      <section className="message-page">
        <h1>{title}</h1>
        <Link className="button button-primary" to={resetPath}>
          {invalidQuery ? "重新搜索" : "返回第 1 页"}
        </Link>
      </section>
    );
  }
  throw error;
}
