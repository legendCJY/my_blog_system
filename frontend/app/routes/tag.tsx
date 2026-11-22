import type { Route } from "./+types/tag";
import { TaxonomyArticles, TaxonomyError } from "../components/directory-pages";
import type { TaxonomyPage } from "../lib/directory";
import { publicResponse } from "../lib/public-articles.server";

export function meta({ data }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: `${data?.taxonomy.name ?? "标签不可用"} · 个人博客` }];
}

export function loader({ request, params }: Route.LoaderArgs) {
  const page = new URL(request.url).searchParams.get("page") ?? "1";
  return publicResponse<TaxonomyPage>(
    `api/v1/public/tags/${encodeURIComponent(params.slug)}?${new URLSearchParams({ page })}`,
  );
}

export default function GroupArticles({ loaderData }: Route.ComponentProps) {
  return <TaxonomyArticles group="tags" page={loaderData} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <TaxonomyError group="tags" error={error} />;
}
