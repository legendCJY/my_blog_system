import type { Route } from "./+types/tags";
import { TaxonomyIndex } from "../components/directory-pages";
import type { TaxonomyEntry } from "../lib/directory";
import { publicResponse } from "../lib/public-articles.server";

export function meta(): Route.MetaDescriptors {
  return [{ title: "全部标签 · 个人博客" }];
}

export function loader() {
  return publicResponse<TaxonomyEntry[]>("api/v1/public/tags");
}

export default function GroupIndex({ loaderData }: Route.ComponentProps) {
  return <TaxonomyIndex group="tags" entries={loaderData} />;
}
