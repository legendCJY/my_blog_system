import { expect, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import type { ArticleContent, EditableArticle } from "../../app/lib/articles";

export const adminArticles = "/api/v1/admin/articles";
export const adminMedia = "/api/v1/admin/media";
export const sessionPath = "/api/v1/auth/session";

export function testEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Run npm run test:e2e.`);
  return value;
}

function credentials() {
  return { username: testEnv("BLOG_E2E_USERNAME"), password: testEnv("BLOG_E2E_PASSWORD") };
}

export async function signIn(page: Page) {
  const { username, password } = credentials();
  await page.getByLabel("用户名", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
}

export async function readJson<T>(response: APIResponse, status = 200): Promise<T> {
  expect(response.status(), response.url()).toBe(status);
  return response.json();
}

export async function adminHeaders(request: APIRequestContext, origin = testEnv("BLOG_E2E_ORIGIN")) {
  const login = await request.post("/api/v1/auth/login", { headers: { Origin: origin }, data: credentials() });
  expect(login.status()).toBe(200);
  const session = await readJson<{ csrf_token: string }>(await request.get(sessionPath));
  return { Origin: origin, "X-CSRF-Token": session.csrf_token };
}

export async function createDraft(request: APIRequestContext, headers: Record<string, string>, data: Partial<ArticleContent>) {
  return readJson<EditableArticle>(await request.post(adminArticles, { headers, data }), 201);
}

export async function publishDraft(request: APIRequestContext, headers: Record<string, string>, article: EditableArticle) {
  return readJson<EditableArticle>(await request.post(`${adminArticles}/${article.id}/publish`, {
    headers, data: { revision: article.revision },
  }));
}

export async function deleteArticle(request: APIRequestContext, headers: Record<string, string>, article: EditableArticle) {
  const response = await request.delete(`${adminArticles}/${article.id}`, { headers, data: { revision: article.revision } });
  expect(response.status()).toBe(204);
}
