import { data, redirect } from "react-router";
import type { Route } from "./+types/admin-logout";
import { adminRequest, sessionRedirect } from "../lib/admin.server";

export function loader() {
  return redirect("/admin/articles");
}

export async function action({ request }: Route.ActionArgs) {
  const fields = await request.formData();
  const csrf = String(fields.get("csrf_token") ?? "");
  const response = await adminRequest(request, "api/v1/auth/logout", {
    method: "POST",
    headers: { "X-CSRF-Token": csrf },
  });
  if (response.status === 401) {
    return redirect("/admin/login", { status: 303 });
  }
  if (!response.ok) {
    throw data(null, { status: response.status });
  }
  return sessionRedirect("/admin/login", response);
}
