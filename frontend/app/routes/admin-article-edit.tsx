import { data, isRouteErrorResponse } from "react-router";
import type { Route } from "./+types/admin-article-edit";
import { ArticleEditor } from "../components/article-editor";
import { AdminArticleMissing } from "../components/admin-article-missing";
import { loadArticleEditor, saveEditor } from "../lib/editor.server";

export function meta(): Route.MetaDescriptors {
  return [{ title: "编辑文章 · 个人博客" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const editor = await loadArticleEditor(request, params.id);
  return data(editor, { status: editor.missing ? 404 : 200 });
}

export function action({ request, params }: Route.ActionArgs) {
  return saveEditor(request, params.id);
}

export default function EditArticle({ loaderData, actionData, params }: Route.ComponentProps) {
  const recovery = actionData?.recovery;
  if (loaderData.missing && !recovery) return <AdminArticleMissing />;
  return <ArticleEditor key={params.id} {...loaderData} notice={actionData}
    content={recovery?.content ?? loaderData.content} newId={recovery?.newId ?? loaderData.newId} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <AdminArticleMissing />;
  }
  throw error;
}
