import { data, isRouteErrorResponse, Link } from "react-router";
import type { Route } from "./+types/admin-preview";
import { AdminArticleMissing } from "../components/admin-article-missing";
import { ImageWithFallback } from "../components/image-with-fallback";
import { adminRequest, loginPageFor } from "../lib/admin.server";
import type { EditableArticle } from "../lib/articles";
import { MarkdownBody } from "../components/markdown-body";


export function meta(): Route.MetaDescriptors {
  return [{ title: "文章预览 · 个人博客" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const response = await adminRequest(request, `api/v1/admin/articles/${encodeURIComponent(params.id)}`);
  if (response.status === 401) throw loginPageFor(request);
  if (!response.ok) throw data(null, { status: response.status });
  return (await response.json()) as EditableArticle;
}

export default function AdminPreview({ loaderData }: Route.ComponentProps) {
  return (
    <section className="message-page">
      <Link to="/admin/articles">返回文章管理</Link>
      <h1>{loaderData.title || "未命名文章"}</h1>
      {loaderData.summary && <p>{loaderData.summary}</p>}
      {loaderData.cover_media_id && (
        <ImageWithFallback className="article-cover" alt="文章封面"
          src={`/api/v1/admin/media/${loaderData.cover_media_id}/content`} />
      )}
      <MarkdownBody html={loaderData.preview_html} toc={loaderData.toc} />
    </section>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <AdminArticleMissing />;
  }
  throw error;
}
