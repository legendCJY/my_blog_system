import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { EditableArticle } from "../../app/lib/articles";
import { adminArticles, adminHeaders, adminMedia, createDraft, deleteArticle, publishDraft, readJson, signIn, testEnv } from "./helpers";

test("普通 404 到 8 秒才返回首页", async ({ page, baseURL }) => {
  const start = new Date("2030-01-01T00:00:00Z");
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1_000));
  expect((await page.goto("/countdown-404"))?.status()).toBe(404);
  await expect(page.getByText("8 秒后将自动返回首页")).toBeVisible();
  await page.clock.runFor(7_999);
  await expect(page).toHaveURL(new URL("/countdown-404", baseURL).href);
  await page.clock.runFor(1);
  await expect(page).toHaveURL(new URL("/", baseURL).href);
});

test("取消和开始搜索会停止倒计时，关闭脚本仍可使用手动入口", async ({ page, browser, baseURL }) => {
  await page.clock.install();
  const missing = "/articles/countdown-controls-404";
  expect((await page.goto(missing))?.status()).toBe(404);
  await page.getByRole("button", { name: "取消自动跳转" }).click();
  await expect(page.getByRole("status")).toHaveText("已取消自动跳转。");
  await page.clock.fastForward(9_000);
  await expect(page).toHaveURL(new URL(missing, baseURL).href);

  expect((await page.goto(missing))?.status()).toBe(404);
  await expect(page.getByRole("button", { name: "取消自动跳转" })).toBeVisible();
  await page.getByRole("link", { name: "搜索文章" }).click();
  await page.clock.fastForward(9_000);
  await expect(page).toHaveURL(new URL("/search", baseURL).href);

  const reader = await browser.newPage({ baseURL, javaScriptEnabled: false });
  try {
    expect((await reader.goto(missing))?.status()).toBe(404);
    await expect(reader.getByRole("button", { name: "取消自动跳转" })).toHaveCount(0);
    await reader.getByRole("link", { name: "搜索文章" }).click();
    await expect(reader).toHaveURL(new URL("/search", baseURL).href);
    await reader.goto(missing);
    await reader.getByRole("link", { name: "立即返回首页" }).click();
    await expect(reader).toHaveURL(new URL("/", baseURL).href);
  } finally {
    await reader.close();
  }
});

test("图片单独返回 404，正文和关于页显示占位", async ({ page, request }) => {
  const headers = await adminHeaders(request);
  const sample = await readFile(testEnv("BLOG_E2E_IMAGE"));
  const upload = async () => readJson<{ id: string; url: string }>(await request.post(adminMedia, {
    headers, multipart: { file: { name: "sample.png", mimeType: "image/png", buffer: sample } },
  }), 201);

  const [good, missing, avatar] = await Promise.all([upload(), upload(), upload()]);
  const body = `## 仍可阅读\n\n![正常图](${good.url})\n\n![缺失示例图](${missing.url})`;
  const article = await publishDraft(request, headers, await createDraft(request, headers, {
    title: "图片占位验收", body_md: body, cover_media_id: missing.id,
  }));
  expect((await request.put("/api/v1/admin/about", {
    headers, data: { avatar_media_id: avatar.id, bio_md: "**公开介绍**" },
  })).status()).toBe(200);

  for (const image of [missing, avatar]) {
    expect(image.id).toMatch(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
    await unlink(join(testEnv("BLOG_E2E_MEDIA_DIR"), image.id.replaceAll("-", "") + ".png"));
    expect((await page.request.get(image.url)).status()).toBe(404);
  }
  expect((await page.goto(`/articles/${encodeURIComponent(article.slug!)}`))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "仍可阅读" })).toBeVisible();
  await expect(page.getByRole("img", { name: "文章封面暂时无法显示" })).toBeVisible();
  await expect(page.getByRole("img", { name: "缺失示例图暂时无法显示" })).toBeVisible();
  const validImage = page.getByRole("img", { name: "正常图", exact: true });
  await expect.poll(() => validImage.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  expect((await page.goto("/about"))?.status()).toBe(200);
  await expect(page.getByText("公开介绍", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "博主头像暂时无法显示" })).toBeVisible();

  const preview = await readJson<{ missing_images: string[] }>(await request.post(`${adminArticles}/preview`, {
    headers, data: { body_md: body, cover_media_id: missing.id },
  }));
  expect(preview.missing_images).toEqual([missing.url, `封面 ${missing.url}`]);
  expect((await request.put("/api/v1/admin/about", { headers, data: { avatar_media_id: avatar.id } })).status()).toBe(400);
});

for (const enabled of [true, false]) {
  test(`编辑目标被删除时保留内容并另存草稿（脚本${enabled ? "开启" : "关闭"}）`, async ({ browser, request, baseURL }) => {
    const headers = await adminHeaders(request);
    const draft = await createDraft(request, headers, { title: "原文章标题", body_md: "原正文" });
    const path = `/admin/articles/${draft.id}/edit`;
    const actor = await browser.newPage({ baseURL, javaScriptEnabled: enabled });
    try {
      if (enabled) {
        await actor.addInitScript(() => {
          let clipboard = "";
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
              writeText: async (value: string) => { clipboard = value; },
              readText: async () => clipboard,
            },
          });
        });
      }
      await actor.goto(path);
      await signIn(actor);
      await expect(actor).toHaveURL(new URL(path, baseURL).href);
      const title = actor.getByLabel("标题", { exact: true });
      const summary = actor.getByLabel("摘要");
      const body = actor.getByLabel("正文（Markdown）");
      const newTitle = "表单里的新标题";
      const newSummary = "表单里的新摘要";
      const newBody = "## 未保存的内容\n\n需要保留正文。";
      await title.fill(newTitle);
      await summary.fill(newSummary);
      await body.fill(newBody);
      await deleteArticle(request, headers, draft);

      const failedSave = actor.waitForResponse((response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname.startsWith(path)
      );
      await actor.getByRole("button", { name: "保存草稿", exact: true }).click();
      expect((await failedSave).status()).toBe(404);
      await expect(actor.getByRole("alert")).toContainText("这条记录已不可用");
      await expect(title).toHaveValue(newTitle);
      await expect(summary).toHaveValue(newSummary);
      await expect(body).toHaveValue(newBody);
      await expect(actor.getByRole("link", { name: "返回文章管理" })).toHaveAttribute("href", "/admin/articles");
      if (enabled) {
        await actor.getByRole("button", { name: "复制正文" }).click();
        await expect(actor.getByRole("status")).toHaveText("正文已复制。");
        expect(await actor.evaluate(() => navigator.clipboard.readText())).toBe(newBody);
      }
      const confirm = actor.getByRole("button", { name: "确认另存为新草稿" });
      await expect(confirm).toHaveCount(0);
      await actor.getByText("另存为新草稿", { exact: true }).click();
      await confirm.click();
      await expect(actor).toHaveURL(/\/edit\?saved=1$/);
      const identifier = new URL(actor.url()).pathname.split("/").at(-2);
      expect(identifier).not.toBe(draft.id);
      const restored = await readJson<EditableArticle>(await request.get(`${adminArticles}/${identifier}`));
      expect(restored.status).toBe("draft");
      expect(restored.title).toBe(newTitle);
      expect(restored.summary).toBe(newSummary);
      expect(restored.body_md.replaceAll("\r\n", "\n")).toBe(newBody);
      expect((await actor.goto(path))?.status()).toBe(404);
      await expect(actor.getByRole("heading", { name: "这条记录已不可用" })).toBeVisible();
      expect((await actor.goto(path.replace(/\/edit$/, "/preview")))?.status()).toBe(404);
    } finally {
      await actor.close();
    }
  });
}
