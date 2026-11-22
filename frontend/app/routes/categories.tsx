import type { Route } from "./+types/categories";
import { TaxonomyIndex } from "../components/directory-pages";
import type { TaxonomyEntry } from "../lib/directory";
import { publicResponse } from "../lib/public-articles.server";

export function meta(): Route.MetaDescriptors {
  return [{ title: "全部分类 · 个人博客" }];
}

export function loader() {
  return publicResponse<TaxonomyEntry[]>("api/v1/public/categories");
}

export default function GroupIndex({ loaderData }: Route.ComponentProps) {
  return <TaxonomyIndex group="categories" entries={loaderData} />;
}
