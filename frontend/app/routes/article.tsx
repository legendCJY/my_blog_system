import { isRouteErrorResponse, Link, useLocation } from "react-router";
import type { Route } from "./+types/article";
import { ImageWithFallback } from "../components/image-with-fallback";
import { MarkdownBody } from "../components/markdown-body";
import { NotFoundPage } from "../components/not-found-page";
import { articleDate } from "../lib/articles";
import { publicArticle } from "../lib/public-articles.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const article = await publicArticle(params.slug);
  const image = article.cover_url ? new URL(article.cover_url, request.url).href : null;
  const url = new URL(`/articles/${encodeURIComponent(article.slug)}`, request.url).href;
  return { article, image, url };
}

export function meta({ data }: Route.MetaArgs): Route.MetaDescriptors {
  if (!data) return [{ title: "文章不可访问 · 个人博客" }];
  return [
    { title: `${data.article.title} · 个人博客` },
    { name: "description", content: data.article.summary },
    { tagName: "link", rel: "canonical", href: data.url },
    { property: "og:type", content: "article" },
    { property: "og:url", content: data.url },
    { property: "og:title", content: data.article.title },
    { property: "og:description", content: data.article.summary },
    ...(data.image ? [{ property: "og:image", content: data.image }] : []),
  ];
}

export default function ArticlePage({ loaderData }: Route.ComponentProps) {
  const { article } = loaderData;
  return (
    <article className="listing-page article-detail">
      <Link to="/">返回文章首页</Link>
      <header>
        <div className="article-meta">
          <time dateTime={article.first_published_at}>{articleDate(article.first_published_at, article.site_timezone)}</time>
          {article.content_updated_at && (
            <span>更新于 <time dateTime={article.content_updated_at}>{articleDate(article.content_updated_at, article.site_timezone)}</time></span>
          )}
          {article.category && <Link to={`/categories/${encodeURIComponent(article.category.slug)}`}>{article.category.name}</Link>}
        </div>
        <h1>{article.title}</h1>
      </header>
      {article.cover_url && <ImageWithFallback className="article-cover" src={article.cover_url} alt="文章封面" />}
      <MarkdownBody html={article.body_html} toc={article.toc} />
      {article.tags.length > 0 && (
        <ul className="article-tags" aria-label="文章标签">
          {article.tags.map((tag) => <li key={tag.id}><Link to={`/tags/${encodeURIComponent(tag.slug)}`}>{tag.name}</Link></li>)}
        </ul>
      )}
    </article>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { pathname } = useLocation();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage key={pathname} kind="article" />;
  }
  throw error;
}
