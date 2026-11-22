import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Taxonomy } from "../../app/lib/articles";
import { adminArticles, adminHeaders, createDraft, deleteArticle, publishDraft, readJson, signIn } from "./helpers";

test("旧地址、空列表、错误页码和管理接口返回正确的 HTTP 状态", async ({ page, request }) => {
  const legacy = await request.get("/archives", { maxRedirects: 0 });
  expect(legacy.status()).toBe(308);
  expect(legacy.headers().location).toBe("/archive");
  expect((await request.head("/archives", { maxRedirects: 0 })).status()).toBe(308);
  expect((await request.post("/archives")).status()).toBe(405);
  expect((await request.get("/archive")).status()).toBe(200);
  expect((await request.post("/api/v1/public/articles")).status()).toBe(405);
  expect((await request.get("/api/v1/admin/no-such-endpoint")).status()).toBe(404);
  expect((await request.get(adminArticles)).status()).toBe(401);

  expect((await page.goto("/admin/no-such-page"))?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "返回后台" })).toHaveAttribute("href", "/admin/articles");
  await expect(page.getByRole("button", { name: "取消自动跳转" })).toHaveCount(0);
  expect((await page.goto("/archive/1900"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "暂无已发布文章" })).toBeVisible();

  const query = new URLSearchParams({ q: randomUUID() });
  expect((await page.goto(`/search?${query}`))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "没有找到文章" })).toBeVisible();
  for (const value of ["0", "invalid"]) {
    expect((await page.goto(`/search?page=${value}&${query}`))?.status()).toBe(400);
    await expect(page.getByRole("heading", { name: "页码无效" })).toBeVisible();
  }
  expect((await request.get("/api/v1/public/articles?page=invalid")).status()).toBe(400);
});

test("不存在、草稿、已下架和已删除文章显示统一的 404 页面", async ({ page, request, browser, baseURL }) => {
  const visitor = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const headers = await adminHeaders(request);
    const title = `链接状态 ${randomUUID().slice(0, 8)}`;
    const draft = await createDraft(request, headers, { title, body_md: "原文章正文" });
    const previewUrl = `/admin/articles/${draft.id}/preview`;
    const previewLink = await visitor.request.get(previewUrl, { maxRedirects: 0 });
    expect(previewLink.status()).toBe(302);
    expect(new URL(previewLink.headers().location, baseURL).searchParams.get("return_to")).toBe(previewUrl);
    await page.goto(previewUrl);
    await signIn(page);
    await expect(page).toHaveURL(new URL(previewUrl, baseURL).href);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    const reader = await visitor.newPage();
    const expectMissing = async (path: string) => {
      expect((await reader.goto(path))?.status()).toBe(404);
      await expect(reader.getByRole("heading", { name: "这篇文章当前无法访问" })).toBeVisible();
      await expect(reader.getByRole("link", { name: "搜索文章" })).toHaveAttribute("href", "/search");
    };
    await expectMissing("/articles/unissued-permalink");
    await expectMissing(`/articles/${draft.id}`);
    const published = await publishDraft(request, headers, draft);
    const path = `/articles/${encodeURIComponent(published.slug!)}`;
    const hidden = await readJson<typeof published>(await request.post(`${adminArticles}/${draft.id}/unpublish`, {
      headers, data: { revision: published.revision },
    }));
    await expectMissing(path);
    const restored = await publishDraft(request, headers, hidden);
    expect(restored.slug).toBe(published.slug);
    expect((await reader.goto(path))?.status()).toBe(200);
    await deleteArticle(request, headers, restored);
    await expectMissing(path);
    const replacement = await publishDraft(request, headers, await createDraft(request, headers, {
      title, body_md: "替换文章正文",
    }));
    expect(replacement.slug).not.toBe(published.slug);
  } finally {
    await visitor.close();
  }
});

test("分类、标签改名保留链接，分页恢复保留搜索词和后台状态", async ({ page, request }) => {
  const headers = await adminHeaders(request);
  const keyword = `分页验收 ${randomUUID().slice(0, 8)}`;
  for (const [group, label] of [["categories", "分类"], ["tags", "标签"]] as const) {
    const endpoint = `/api/v1/admin/${group}`;
    const work = await readJson<Taxonomy>(await request.post(endpoint, {
      headers, data: { name: `${keyword} ${label}` },
    }), 201);
    const path = `/${group}/${encodeURIComponent(work.slug)}`;
    expect((await page.goto(path))?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "暂无已发布文章" })).toBeVisible();
    expect((await page.goto(`${path}?page=2`))?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "查看第 1 页" })).toHaveAttribute("href", `${path}?page=1`);
    const renamed = await readJson<Taxonomy>(await request.patch(`${endpoint}/${work.id}`, {
      headers, data: { name: `改名后的${label} ${keyword}` },
    }));
    expect(renamed.slug).toBe(work.slug);
    expect((await page.goto(path))?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: renamed.name })).toBeVisible();
    expect((await request.delete(`${endpoint}/${work.id}`, { headers })).status()).toBe(204);
    expect((await page.goto(path))?.status()).toBe(404);
    await expect(page.getByRole("link", { name: `浏览全部${label}` })).toHaveAttribute("href", `/${group}`);
    await expect(page.getByRole("button", { name: "取消自动跳转" })).toHaveCount(0);
  }

  for (let index = 0; index < 11; index++) {
    const article = await createDraft(request, headers, { title: `分页示例 ${index}`, body_md: keyword });
    await publishDraft(request, headers, article);
  }
  const query = new URLSearchParams({ q: keyword });
  expect((await page.goto(`/search?page=99&${query}`))?.status()).toBe(404);
  await expect(page.getByText("当前只有 2 页。")).toBeVisible();
  const lastPage = page.getByRole("link", { name: "查看第 2 页" });
  await expect(lastPage).toHaveAttribute("href", `/search?page=2&${query}`);
  await lastPage.click();
  await expect(page.getByRole("navigation", { name: "公开文章分页" })).toContainText("第 2 页，共 2 页");

  await page.goto("/admin/articles?status=draft&page=99");
  await signIn(page);
  await expect(page.getByRole("heading", { name: "这一页不存在" })).toBeVisible();
  await expect(page.getByRole("link", { name: "查看第 1 页" })).toHaveAttribute(
    "href", "/admin/articles?page=1&status=draft",
  );
});
