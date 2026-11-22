import { data, redirectDocument } from "react-router";
import { randomUUID } from "node:crypto";
import type { ArticleContent, EditableArticle, EditorOptions } from "./articles";
import { adminRequest, loginPageFor, requireAdminSession } from "./admin.server";

export type EditorNotice = {
  code: string;
  message: string;
  details: string[];
  draft?: { id: string; revision: number };
  recovery?: { content: ArticleContent; newId: string };
};

type EditorSubmission = { content: ArticleContent; newId: string; recovering: boolean };

const emptyContent: ArticleContent = {
  title: "", body_md: "", summary: null, cover_media_id: null, category_id: null, tag_ids: [],
};
const articleEndpoint = "api/v1/admin/articles";

export async function loadArticleEditor(request: Request, id?: string) {
  const admin = await requireAdminSession(request);
  const optionsResponse = await adminRequest(request, `${articleEndpoint}/options`);
  if (optionsResponse.status === 401) throw loginPageFor(request);
  if (!optionsResponse.ok) throw data(null, { status: optionsResponse.status });
  const options = (await optionsResponse.json()) as EditorOptions;
  const fields = { newId: randomUUID(), options, csrf: admin.csrf_token };
  if (!id) {
    return { ...fields, article: null, content: emptyContent, missing: false };
  }

  const response = await adminRequest(request, `${articleEndpoint}/${encodeURIComponent(id)}`);
  if (response.status === 401) throw loginPageFor(request);
  if (response.status === 404) return { ...fields, article: null, content: emptyContent, missing: true };
  if (!response.ok) throw data(null, { status: response.status });
  const article = (await response.json()) as EditableArticle;
  return { ...fields, article, content: article, missing: false };
}

export function editorContent(form: FormData): ArticleContent {
  const optional = (key: string) => String(form.get(key) ?? "") || null;
  return {
    title: String(form.get("title") ?? ""),
    body_md: String(form.get("body_md") ?? ""),
    summary: optional("summary"),
    cover_media_id: optional("cover_media_id"),
    category_id: optional("category_id"),
    tag_ids: form.getAll("tag_ids").map(String),
  };
}

export function editorRequest(
  request: Request, path: string, method: string, payload: object, csrf: string,
) {
  return adminRequest(request, path, {
    method,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25_000),
  }).catch(() => Response.json(
    { code: "service_unavailable", message: "服务暂时不可用，当前编辑内容已保留。请稍后重试。" },
    { status: 503 },
  ));
}

export async function editorIssue(response: Response, draft?: EditorNotice["draft"], submission?: EditorSubmission) {
  const problem = await response.json().catch(() => ({}));
  const message = response.status === 401
    ? "登录已过期。请重新登录后重试，当前编辑内容会保留。"
    : response.status === 422 ? "请检查文章字段的长度和格式。"
    : problem.message ?? "暂时无法完成操作，请稍后重试。";
  return data<EditorNotice>({
    code: problem.code ?? "request_failed",
    message,
    details: Array.isArray(problem.details) ? problem.details.filter((item: unknown) => typeof item === "string") : [],
    draft,
    recovery: submission && (problem.code === "article_not_found" || submission.recovering)
      ? { content: submission.content, newId: submission.newId }
      : undefined,
  }, { status: response.status });
}

export async function saveEditor(request: Request, routeId?: string) {
  const form = await request.formData();
  const csrf = String(form.get("csrf_token") ?? "");
  const intent = form.get("intent");
  const content = editorContent(form);
  const newId = String(form.get("new_id") ?? "");
  const submission = { content, newId, recovering: form.get("recovering") === "1" };
  const existingId = routeId ?? (String(form.get("created_id") ?? "") || undefined);
  const revision = Number(form.get("revision"));
  const createCopy = intent === "copy_draft";

  if (!(intent === "save" || intent === "publish" || intent === "unpublish" ||
      intent === "delete" || createCopy) ||
      (!existingId && (intent === "delete" || intent === "unpublish"))) {
    return data<EditorNotice>({ code: "invalid_action", message: "操作无效。", details: [] }, { status: 400 });
  }

  const previouslyCreated = !routeId && existingId ? { id: existingId, revision } : undefined;
  if (!existingId || createCopy) {
    const response = await editorRequest(request, articleEndpoint, "POST", { ...content, id: newId }, csrf);
    if (!response.ok) return editorIssue(response, previouslyCreated, submission);
    const draft = (await response.json()) as EditableArticle;
    if (intent !== "publish" || draft.status === "published") {
      return redirectDocument(`/admin/articles/${draft.id}/edit?saved=1`, { status: 303 });
    }

    const publication = await editorRequest(request, `${articleEndpoint}/${draft.id}/publish`, "POST",
      { revision: draft.revision }, csrf);
    if (!publication.ok) return editorIssue(publication, { id: draft.id, revision: draft.revision }, submission);
    return redirectDocument(`/admin/articles/${draft.id}/edit?published=1`, { status: 303 });
  }

  const path = `${articleEndpoint}/${encodeURIComponent(existingId)}`;
  const response = intent === "publish"
    ? await editorRequest(request, `${path}/publish`, "POST", { revision, content }, csrf)
    : intent === "unpublish"
      ? await editorRequest(request, `${path}/unpublish`, "POST", { revision }, csrf)
      : intent === "delete"
        ? await editorRequest(request, path, "DELETE", { revision }, csrf)
        : await editorRequest(request, path, "PATCH", { ...content, revision }, csrf);
  if (!response.ok) return editorIssue(response, previouslyCreated, submission);
  if (intent === "delete") return redirectDocument("/admin/articles", { status: 303 });
  const notice = intent === "publish" ? "published" : intent === "unpublish" ? "unpublished" : "saved";
  return redirectDocument(`/admin/articles/${encodeURIComponent(existingId)}/edit?${notice}=1`, { status: 303 });
}
