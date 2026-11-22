import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { PublicArticleDetail } from "../../app/lib/articles";
import { adminArticles, readJson, signIn, testEnv } from "./helpers";

async function addGroup(page: Page, group: "categories" | "tags", label: string, name: string) {
  await page.goto(`/admin/${group}`);
  await page.getByLabel(`新${label}名称`).fill(name);
  await page.getByRole("button", { name: `新增${label}` }).click();
  await expect(page.getByRole("status")).toHaveText(`已新增${label}。`);
  const item = page.getByRole("link", { name, exact: true });
  const path = await item.getAttribute("href");
  expect(path).toMatch(new RegExp(`^/${group}/`));
  return path!;
}

test("保存带图草稿、预览、发布并通过固定链接更新和重新发布", async ({ page, browser }, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  const title = `发布验收 ${suffix}`;
  const updatedTitle = `更新标题 ${suffix}`;
  const summary = "分享摘要和封面";
  const keyword = `中文搜索词 ${suffix}`;
  const category = `学习笔记 ${suffix}`;
  const tag = `移动端 ${suffix}`;
  const image = testEnv("BLOG_E2E_IMAGE");
  const visitor = await browser.newPage({ ...testInfo.project.use });
  try {
    await page.goto("/admin/articles");
    await expect(page).toHaveURL(/\/admin\/login\?return_to=/);
    await signIn(page);
    await expect(page.getByRole("heading", { name: "文章管理" })).toBeVisible();

    const categoryPath = await addGroup(page, "categories", "分类", category);
    const tagPath = await addGroup(page, "tags", "标签", tag);
    await page.goto("/admin/articles/new");
    const titleInput = page.getByLabel("标题", { exact: true });
    const body = page.getByLabel("正文（Markdown）");
    await titleInput.fill(title);
    await page.getByLabel("摘要").fill(summary);
    await body.fill(`## 阅读小节\n\n${keyword}\n\n\`\`\`python\nprint('${"long-code-line-".repeat(20)}')\n\`\`\`\n`);
    await page.getByLabel("插入正文图片").setInputFiles(image);
    await expect(body).toHaveValue(/!\[图片\]\(\/media\/[a-f0-9-]+\)/);
    const imageUrl = (await body.inputValue()).match(/\/media\/[a-f0-9-]+/)![0];
    await page.getByLabel("上传封面").setInputFiles(image);
    await expect(page.getByRole("img", { name: "已选封面" })).toBeVisible();
    await page.locator('select[name="category_id"]').selectOption({ label: category });
    await page.getByRole("checkbox", { name: tag }).check();

    await page.getByRole("button", { name: "预览当前内容" }).click();
    const preview = page.getByRole("region", { name: "当前内容预览" });
    await expect(preview.getByRole("heading", { name: "阅读小节" })).toBeVisible();
    await expect(preview.locator("pre code")).toContainText("print");
    await expect(preview.getByRole("img", { name: "图片", exact: true })).toBeVisible();
    const enteredBody = await body.inputValue();
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect(page).toHaveURL(/\/edit\?saved=1$/);
    const editorPath = new URL(page.url()).pathname;
    await page.reload();
    await expect(titleInput).toHaveValue(title);
    await expect(body).toHaveValue(enteredBody);
    expect((await visitor.request.get(imageUrl)).status()).toBe(404);
    expect((await visitor.request.get(editorPath.replace(/\/edit$/, "/preview"), { maxRedirects: 0 })).status()).toBe(302);

    await page.getByRole("button", { name: "发布文章", exact: true }).click();
    await expect(page).toHaveURL(/\/edit\?published=1$/);
    const publicPath = await page.getByRole("link", { name: "打开已发布文章" }).getAttribute("href");
    expect(publicPath).toMatch(/^\/articles\//);
    expect((await visitor.request.get(imageUrl)).status()).toBe(200);

    const publicArticle = await readJson<PublicArticleDetail>(
      await visitor.request.get(`/api/v1/public${publicPath}`),
    );
    const year = new Intl.DateTimeFormat("en", { timeZone: publicArticle.site_timezone, year: "numeric" })
      .format(new Date(publicArticle.first_published_at));
    for (const path of ["/", categoryPath, tagPath, `/archive/${year}`, `/search?${new URLSearchParams({ q: keyword })}`]) {
      expect((await visitor.goto(path))?.status()).toBe(200);
      await expect(visitor.getByRole("link", { name: title, exact: true })).toHaveAttribute("href", publicPath!);
    }
    await visitor.getByRole("link", { name: title, exact: true }).click();
    await expect(visitor.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(visitor.locator('meta[property="og:description"]')).toHaveAttribute("content", summary);
    const coverUrl = await visitor.locator('meta[property="og:image"]').getAttribute("content");
    expect(coverUrl).toMatch(/\/media\//);
    expect((await visitor.request.get(coverUrl!)).status()).toBe(200);
    await expect.poll(() => visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (testInfo.project.name === "mobile") {
      const code = visitor.locator(".markdown-body pre");
      expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    }

    await titleInput.fill(updatedTitle);
    await page.getByRole("button", { name: "预览当前内容" }).click();
    await expect(preview.getByRole("heading", { name: updatedTitle, exact: true })).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "更新文章", exact: true }).click();
    await expect(page).toHaveURL(/\/edit\?saved=1$/);
    await visitor.reload();
    await expect(visitor.getByRole("heading", { name: updatedTitle, exact: true })).toBeVisible();
    await expect(visitor.locator("article time").first()).toHaveAttribute("datetime", publicArticle.first_published_at);

    await page.getByText("下架文章", { exact: true }).click();
    await page.getByRole("button", { name: "确认下架" }).click();
    await expect(page).toHaveURL(/\/edit\?unpublished=1$/);
    expect((await visitor.request.get(publicPath!)).status()).toBe(404);
    expect((await visitor.request.get(imageUrl)).status()).toBe(404);
    await page.getByRole("button", { name: "重新发布", exact: true }).click();
    await expect(page).toHaveURL(/\/edit\?published=1$/);
    expect((await visitor.goto(publicPath!))?.status()).toBe(200);
    await expect(visitor.getByRole("heading", { name: updatedTitle, exact: true })).toBeVisible();
    await expect(visitor.locator("article time").first()).toHaveAttribute("datetime", publicArticle.first_published_at);

    await page.goto("/admin/articles");
    await page.getByRole("button", { name: "退出登录" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    expect((await page.request.get(adminArticles)).status()).toBe(401);
  } finally {
    await visitor.close();
  }
});
