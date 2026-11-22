import type { Route } from "./+types/admin-article-preview-action";
import { editorContent, editorIssue, editorRequest } from "../lib/editor.server";

export async function action({ request }: Route.ActionArgs) {
  const fields = await request.formData();
  const response = await editorRequest(
    request, "api/v1/admin/articles/preview", "POST",
    editorContent(fields), String(fields.get("csrf_token") ?? ""),
  );
  if (!response.ok) return editorIssue(response);
  return response.json();
}
