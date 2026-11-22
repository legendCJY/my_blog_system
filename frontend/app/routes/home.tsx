import type { Route } from "./+types/home";
import { SearchForm } from "../components/search-form";
import { ArticleListError, PublicArticleList } from "../components/public-article-list";
import { publicArticlePage } from "../lib/public-articles.server";

export function meta(): Route.MetaDescriptors {
  return [{ title: "文章 · 个人博客" }];
}

export function loader({ request }: Route.LoaderArgs) {
  return publicArticlePage(new URL(request.url).searchParams.get("page") ?? "1", "");
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <section className="listing-page">
      <div className="listing-header">
        <h1>文章</h1>
        <SearchForm />
      </div>
      {loaderData.items.length > 0 ? <PublicArticleList articles={loaderData} where="/" query="" /> : (
        <div className="empty-state">
          <h2>暂无已发布文章</h2>
          <p>发布后，文章会显示在这里。</p>
        </div>
      )}
    </section>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <ArticleListError error={error} where="/" />;
}
