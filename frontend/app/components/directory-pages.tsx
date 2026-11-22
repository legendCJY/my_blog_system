import { isRouteErrorResponse, Link, useLocation } from "react-router";
import type { PublicArticlePage } from "../lib/articles";
import { groupLabels, type Group, type TaxonomyEntry, type TaxonomyPage } from "../lib/directory";
import { ArticleListError, PublicArticleList } from "./public-article-list";

export function DirectoryIndex({ title, empty, entries }: {
  title: string; empty: string; entries: { path: string; label: string; count: number }[];
}) {
  return (
    <section className="listing-page">
      <div className="listing-header"><h1>{title}</h1></div>
      {entries.length ? (
        <ul className="directory-list">
          {entries.map(({ path, label, count }) => (
            <li key={path}>
              <Link to={path} className="directory-item"><strong>{label}</strong><span>{count} 篇</span></Link>
            </li>
          ))}
        </ul>
      ) : <div className="empty-state"><h2>{empty}</h2></div>}
    </section>
  );
}

export function TaxonomyIndex({ group, entries }: { group: Group; entries: TaxonomyEntry[] }) {
  const label = groupLabels[group];
  return <DirectoryIndex title={`全部${label}`} empty={`暂无${label}`} entries={entries.map((item) => ({
    path: `/${group}/${encodeURIComponent(item.slug)}`, label: item.name, count: item.article_count,
  }))} />;
}

export function DirectoryArticles({ title, articles, indexPath, indexLabel, path }: {
  title: string; articles: PublicArticlePage; indexPath: string; indexLabel: string; path: string;
}) {
  return (
    <section className="listing-page">
      <div className="listing-header directory-heading">
        <Link to={indexPath}>{indexLabel}</Link>
        <h1>{title}</h1>
      </div>
      {articles.items.length ? <PublicArticleList articles={articles} where={path} query="" /> :
        <div className="empty-state"><h2>暂无已发布文章</h2></div>}
    </section>
  );
}

export function TaxonomyArticles({ group, page }: { group: Group; page: TaxonomyPage }) {
  return <DirectoryArticles title={page.taxonomy.name} articles={page.articles}
    indexPath={`/${group}`} indexLabel={`浏览全部${groupLabels[group]}`}
    path={`/${group}/${encodeURIComponent(page.taxonomy.slug)}`} />;
}

export function TaxonomyError({ group, error }: { group: Group; error: unknown }) {
  const { pathname } = useLocation();
  if (isRouteErrorResponse(error) && error.status === 404 && error.data?.code === "taxonomy_not_found") {
    const label = groupLabels[group];
    return (
      <section className="message-page">
        <h1>这个{label}已不可用</h1>
        <Link className="button button-primary" to={`/${group}`}>浏览全部{label}</Link>
      </section>
    );
  }
  return <ArticleListError error={error} where={pathname} />;
}
