import { data, redirect } from "react-router";
import { adminRequest, loginPageFor, requireAdminSession } from "./admin.server";
import type { Group, TaxonomyEntry } from "./directory";
import { editorIssue, editorRequest } from "./editor.server";

export async function loadTaxonomy(request: Request, group: Group) {
  const admin = await requireAdminSession(request);
  const response = await adminRequest(request, `api/v1/admin/${group}`);
  if (response.status === 401) throw loginPageFor(request);
  if (!response.ok) throw data(null, { status: response.status });
  return { csrf: admin.csrf_token, entries: await response.json() as TaxonomyEntry[] };
}

export async function saveTaxonomy(request: Request, group: Group) {
  const fields = await request.formData();
  const intent = fields.get("intent");
  const itemId = String(fields.get("id") ?? "");
  const path = `api/v1/admin/${group}`;
  const name = String(fields.get("name") ?? "");
  const csrf = String(fields.get("csrf_token") ?? "");

  let response: Response;
  if (intent === "create") {
    response = await editorRequest(request, path, "POST", { name }, csrf);
  } else if ((intent === "rename" || intent === "delete") && /^[a-f0-9-]{36}$/i.test(itemId)) {
    response = await editorRequest(
      request, `${path}/${itemId}`, intent === "rename" ? "PATCH" : "DELETE", { name }, csrf,
    );
  } else {
    return data({ code: "invalid_action", message: "操作无效。", details: [] }, { status: 400 });
  }

  if (!response.ok) {
    const issue = await editorIssue(response);
    if (intent === "rename" && issue.data.code === "taxonomy_not_found") {
      return data({ ...issue.data, attemptedName: name }, { status: response.status });
    }
    return issue;
  }
  return redirect(`/admin/${group}?done=${intent}`, { status: 303 });
}
