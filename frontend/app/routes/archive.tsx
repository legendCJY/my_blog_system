import type { Route } from "./+types/archive";
import { DirectoryIndex } from "../components/directory-pages";
import { archivePath, type ArchiveYear } from "../lib/directory";
import { publicResponse } from "../lib/public-articles.server";

export function meta(): Route.MetaDescriptors {
  return [{ title: "文章归档 · 个人博客" }];
}

export function loader() {
  return publicResponse<ArchiveYear[]>("api/v1/public/archive");
}

export default function Archive({ loaderData }: Route.ComponentProps) {
  return <DirectoryIndex title="文章归档" empty="暂无已发布文章" entries={loaderData.map((item) => ({
    path: archivePath(item.year), label: `${item.year} 年`, count: item.article_count,
  }))} />;
}
