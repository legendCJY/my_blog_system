import { useLocation } from "react-router";
import type { Route } from "./+types/search";
import { SearchForm } from "../components/search-form";
import { ArticleListError, PublicArticleList } from "../components/public-article-list";
import { publicArticlePage } from "../lib/public-articles.server";

export function meta(): Route.MetaDescriptors {
  return [{ title: "搜索文章 · 个人博客" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  const articles = await publicArticlePage(params.get("page") ?? "1", query);
  return { query, articles };
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const { query, articles } = loaderData;
  return (
    <section className="listing-page">
      <div className="listing-header">
        <h1>搜索文章</h1>
        <SearchForm key={query} query={query} />
      </div>
      {query && articles.items.length > 0 ? (
        <PublicArticleList articles={articles} where="/search" query={query} />
      ) : (
        <div className="empty-state">
          <h2>{query ? "没有找到文章" : "输入关键词搜索"}</h2>
          {query && <p>关键词「{query}」暂无结果。</p>}
        </div>
      )}
    </section>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { search } = useLocation();
  const query = new URLSearchParams(search).get("q") ?? "";
  return <ArticleListError error={error} where="/search" filters={{ q: query }} />;
}
