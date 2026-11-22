import { data, redirect } from "react-router";
import { fetchApi } from "./api.server";

const adminHome = "/admin/articles";
const returnOrigin = "https://blog.invalid";
const adminPagePath = /^\/admin(?:\/(?:articles(?:\/new|\/[a-zA-Z0-9_-]+\/(?:preview|edit))?|categories|tags|about))?\/?$/;

type AdminSession = {
  username: string;
  csrf_token: string;
};

export function safeReturnPath(candidate: unknown) {
  if (typeof candidate !== "string" || !candidate.startsWith("/")) {
    return adminHome;
  }

  try {
    const url = new URL(candidate, returnOrigin);
    if (url.origin === returnOrigin && adminPagePath.test(url.pathname)) {
      return url.pathname + url.search;
    }
  } catch {
    // Fall back to the article management page for invalid URLs.
  }

  return adminHome;
}

export function loginPageFor(request: Request) {
  const currentUrl = new URL(request.url);
  const params = new URLSearchParams({
    return_to: safeReturnPath(currentUrl.pathname + currentUrl.search),
  });
  return redirect(`/admin/login?${params}`, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function adminRequest(request: Request, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const cookie = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("blog_session="));
  if (cookie) headers.set("Cookie", cookie);

  const origin = request.headers.get("origin");
  if (origin) headers.set("Origin", origin);

  try {
    return await fetchApi(path, { ...init, headers });
  } catch {
    throw data(null, { status: 503 });
  }
}

export async function readAdminSession(request: Request) {
  const response = await adminRequest(request, "api/v1/auth/session");
  if (response.status === 401) return null;
  if (!response.ok) throw data(null, { status: response.status });
  return (await response.json()) as AdminSession;
}

export async function requireAdminSession(request: Request) {
  const session = await readAdminSession(request);
  if (!session) throw loginPageFor(request);
  return session;
}

export function sessionRedirect(location: string, response: Response) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  const cookie = response.headers.get("set-cookie");
  if (cookie) headers.set("Set-Cookie", cookie);
  return redirect(location, { status: 303, headers });
}
