export type ArticleStatus = "draft" | "published" | "unpublished";

export const statusNames: Record<ArticleStatus, string> = {
  draft: "草稿",
  published: "已发布",
  unpublished: "已下架",
};

export type ArticleContent = {
  title: string;
  body_md: string;
  summary: string | null;
  cover_media_id: string | null;
  category_id: string | null;
  tag_ids: string[];
};

export type OutlineEntry = { id: string; title: string; level: number };
export type Taxonomy = { id: string; name: string; slug: string };
export type EditorOptions = { categories: Taxonomy[]; tags: Taxonomy[] };

export type EditableArticle = ArticleContent & {
  id: string;
  status: ArticleStatus;
  revision: number;
  slug: string | null;
  preview_html: string;
  toc: OutlineEntry[];
};

export type PublicArticle = {
  slug: string;
  title: string;
  summary: string;
  cover_url: string | null;
  first_published_at: string;
  content_updated_at: string | null;
  category: Taxonomy | null;
  site_timezone: string;
};

export type PublicArticlePage = { items: PublicArticle[]; page: number; total_pages: number };
export type PublicArticleDetail = PublicArticle & { body_html: string; toc: OutlineEntry[]; tags: Taxonomy[] };

export function articleDate(value: string, timeZone = "Asia/Shanghai") {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeZone }).format(new Date(value));
}
