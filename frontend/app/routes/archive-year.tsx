import { isRouteErrorResponse, Link, useLocation } from "react-router";
import type { Route } from "./+types/archive-year";
import { DirectoryArticles } from "../components/directory-pages";
import { ArticleListError } from "../components/public-article-list";
import { publicArticlePage } from "../lib/public-articles.server";

export function meta({ data }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: data ? `${data.year} 年归档 · 个人博客` : "归档不可用 · 个人博客" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const page = new URL(request.url).searchParams.get("page") ?? "1";
  return { year: params.year, articles: await publicArticlePage(page, "", params.year) };
}

export default function ArchiveYear({ loaderData }: Route.ComponentProps) {
  return <DirectoryArticles title={`${loaderData.year} 年归档`} articles={loaderData.articles}
    indexPath="/archive" indexLabel="浏览全部年份" path={`/archive/${loaderData.year}`} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { pathname } = useLocation();
  if (isRouteErrorResponse(error) && error.status === 400 && error.data?.code === "invalid_year") {
    return (
      <section className="message-page">
        <h1>归档年份无效</h1>
        <Link className="button button-primary" to="/archive">浏览全部年份</Link>
      </section>
    );
  }
  return <ArticleListError error={error} where={pathname} />;
}
