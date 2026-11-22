import type { PublicArticlePage, Taxonomy } from "./articles";

export const groupLabels = { categories: "分类", tags: "标签" } as const;
export type Group = keyof typeof groupLabels;
export type TaxonomyEntry = Taxonomy & { article_count: number };
export type TaxonomyPage = { taxonomy: Taxonomy; articles: PublicArticlePage };
export type ArchiveYear = { year: number; article_count: number };
export type SocialLink = { name: string; url: string };
export type PublicAbout = { bio_html: string; avatar_url: string | null; links: SocialLink[] };
export type AboutContent = { bio_md: string; avatar_media_id: string | null; links: SocialLink[] };

export function archivePath(year: number) {
  return `/archive/${String(year).padStart(4, "0")}`;
}
