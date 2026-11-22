import type { Route } from "./+types/category";
import { TaxonomyArticles, TaxonomyError } from "../components/directory-pages";
import type { TaxonomyPage } from "../lib/directory";
import { publicResponse } from "../lib/public-articles.server";

export function meta({ data }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: `${data?.taxonomy.name ?? "分类不可用"} · 个人博客` }];
}

export function loader({ request, params }: Route.LoaderArgs) {
  const page = new URL(request.url).searchParams.get("page") ?? "1";
  return publicResponse<TaxonomyPage>(
    `api/v1/public/categories/${encodeURIComponent(params.slug)}?${new URLSearchParams({ page })}`,
  );
}

export default function GroupArticles({ loaderData }: Route.ComponentProps) {
  return <TaxonomyArticles group="categories" page={loaderData} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <TaxonomyError group="categories" error={error} />;
}
