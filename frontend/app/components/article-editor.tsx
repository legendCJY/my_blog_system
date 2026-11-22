import { useRef, useState, type ChangeEvent } from "react";
import { Form, Link, useFetcher, useNavigation, useSearchParams } from "react-router";
import type { ArticleContent, EditableArticle, EditorOptions, OutlineEntry } from "../lib/articles";
import { statusNames } from "../lib/articles";
import type { EditorNotice } from "../lib/editor.server";
import { uploadMedia } from "../lib/upload";
import { ImageWithFallback } from "./image-with-fallback";
import { MarkdownBody } from "./markdown-body";

type Preview = {
  title: string; summary: string | null; cover_media_id: string | null;
  html: string; toc: OutlineEntry[]; missing_images: string[];
};
type EditorProps = {
  article: EditableArticle | null;
  content: ArticleContent;
  newId: string;
  options: EditorOptions;
  csrf: string;
  notice?: EditorNotice;
};

export function ArticleEditor({ article, content, newId, options, csrf, notice }: EditorProps) {
  const [body, setBody] = useState(content.body_md);
  const [cover, setCover] = useState(content.cover_media_id);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [copyBodyNotice, setCopyBodyNotice] = useState("");
  const [currentCsrf, setCurrentCsrf] = useState(csrf);
  const [sessionNotice, setSessionNotice] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const preview = useFetcher<Preview | EditorNotice>();
  const navigation = useNavigation();
  const [search] = useSearchParams();
  const busy = navigation.state !== "idle";
  const targetLost = Boolean(notice?.recovery);
  const canSaveCopy = targetLost || notice?.code === "revision_conflict";
  const isPublished = article?.status === "published";
  const publicationWord = article?.status === "unpublished" ? "重新发布" : "发布文章";
  const publicPath = article?.slug ? `/articles/${encodeURIComponent(article.slug)}` : null;
  const success = search.has("published") ? "文章已发布。"
    : search.has("unpublished") ? "文章已下架。" : search.has("saved") ? "已保存。" : null;

  function showPreview() {
    if (!formRef.current) return;
    const fields = new FormData(formRef.current);
    preview.submit(fields, { method: "post", action: "/admin/articles/preview" });
  }

  async function upload(event: ChangeEvent<HTMLInputElement>, target: "body" | "cover") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      const result = await uploadMedia(file, currentCsrf);
      if (target === "cover") {
        setCover(result.id);
      } else {
        const textarea = bodyRef.current;
        const start = textarea?.selectionStart ?? body.length;
        const end = textarea?.selectionEnd ?? start;
        setBody((text) => `${text.slice(0, start)}\n\n![图片](${result.url})\n\n${text.slice(end)}`);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "图片上传失败，请稍后重试。");
    } finally {
      setUploading(false);
    }
  }

  async function copyPublicLink() {
    if (!publicPath) return;
    try {
      await navigator.clipboard.writeText(new URL(publicPath, window.location.origin).href);
      setCopyNotice("已复制文章链接。");
    } catch {
      setCopyNotice("请打开文章后，从地址栏复制链接。");
    }
  }

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(body);
      setCopyBodyNotice("正文已复制。");
    } catch {
      bodyRef.current?.focus();
      bodyRef.current?.select();
      setCopyBodyNotice("已选中正文，请使用浏览器的复制快捷键。");
    }
  }

  async function refreshSession() {
    try {
      const response = await fetch("/api/v1/auth/session", { cache: "no-store" });
      if (!response.ok) throw new Error("请先在新标签页登录后台。");
      const identity = await response.json();
      setCurrentCsrf(identity.csrf_token);
      setSessionNotice("登录状态已更新，可以重试。");
    } catch (error) {
      setSessionNotice(error instanceof Error ? error.message : "暂时无法确认登录状态。");
    }
  }

  return (
    <section className="listing-page editor-page">
      <Link to="/admin/articles">返回文章管理</Link>
      <div className="admin-heading">
        <h1>{article || targetLost ? "编辑文章" : "新建文章"}</h1>
        {article && !targetLost && <span className="article-status">{statusNames[article.status]}</span>}
      </div>
      {success && !notice && <p role="status" className="editor-success">{success}</p>}
      {publicPath && isPublished && !targetLost && (
        <div className="page-actions editor-public-link">
          <a href={publicPath} target="_blank" rel="noreferrer">打开已发布文章</a>
          <button className="button button-outline" type="button" onClick={copyPublicLink}>复制链接</button>
          {copyNotice && <span role="status">{copyNotice}</span>}
        </div>
      )}
      <Form method="post" ref={formRef} className="editor-form">
        <input name="csrf_token" type="hidden" value={currentCsrf} />
        <input name="new_id" type="hidden" value={newId} />
        <input name="created_id" type="hidden" value={notice?.draft?.id ?? ""} />
        <input name="revision" type="hidden" value={article?.revision ?? notice?.draft?.revision ?? 1} />
        <input name="cover_media_id" type="hidden" value={cover ?? ""} />
        {targetLost && <input name="recovering" type="hidden" value="1" />}
        <label className="editor-field">
          标题
          <input name="title" maxLength={240} defaultValue={content.title} />
        </label>
        <label className="editor-field">
          摘要
          <textarea name="summary" maxLength={500} rows={2} defaultValue={content.summary ?? ""} />
        </label>
        <div className="editor-toolbar">
          <label className="editor-field">
            插入正文图片
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading || busy}
              onChange={(event) => void upload(event, "body")} />
          </label>
          <label className="editor-field">
            上传封面
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading || busy}
              onChange={(event) => void upload(event, "cover")} />
          </label>
        </div>
        {uploading && <p role="status">正在上传图片…</p>}
        {uploadError && <p role="alert" className="editor-error">{uploadError}</p>}
        {cover && (
          <div className="editor-cover">
            <ImageWithFallback src={`/api/v1/admin/media/${cover}/content`} alt="已选封面" />
            <button type="button" className="button button-outline" onClick={() => setCover(null)}>移除封面</button>
          </div>
        )}
        <label className="editor-field">
          正文（Markdown）
          <textarea ref={bodyRef} name="body_md" rows={16} maxLength={200000} value={body}
            onChange={(event) => setBody(event.target.value)} />
        </label>
        {options.categories.length > 0 && (
          <label className="editor-field">
            分类
            <select name="category_id" defaultValue={content.category_id ?? ""}>
              <option value="">未分类</option>
              {options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
        )}
        {options.tags.length > 0 && (
          <fieldset className="editor-tags"><legend>标签</legend>
            {options.tags.map((tag) => (
              <label key={tag.id}>
                <input type="checkbox" name="tag_ids" value={tag.id} defaultChecked={content.tag_ids.includes(tag.id)} /> {tag.name}
              </label>
            ))}
          </fieldset>
        )}
        {notice && (
          <div role="alert" className="editor-error editor-alert">
            <p>{notice.message}</p>
            {notice.details.length > 0 && <ul>{notice.details.map((item) => <li key={item}>{item}</li>)}</ul>}
            {notice.draft && <p>当前内容已保存为草稿，可继续编辑。</p>}
            {(notice.code === "authentication_required" || notice.code === "invalid_csrf") && (
              <div className="page-actions">
                <a href="/admin/login" target="_blank" rel="noreferrer">在新标签页重新登录</a>
                <button className="button button-outline" type="button" onClick={() => void refreshSession()}>更新登录状态</button>
                {sessionNotice && <span role="status">{sessionNotice}</span>}
              </div>
            )}
            {targetLost && <p>当前填写的内容仍保留在表单中，可以复制正文或另存为草稿。</p>}
            {notice.code === "revision_conflict" && <p>
                <a href="">重新载入</a>
            </p>}
          </div>
        )}
        <div className="page-actions">
          <button type="button" className="button button-outline" onClick={showPreview}
            disabled={preview.state !== "idle" || uploading || busy}>预览当前内容</button>
          {!targetLost && (
            <>
              <button type="submit" className={`button ${isPublished ? "button-primary" : "button-outline"}`}
                name="intent" value="save" disabled={busy || uploading}>
                {isPublished ? "更新文章" : article?.status === "unpublished" ? "保存编辑" : "保存草稿"}
              </button>
              {!isPublished && <button type="submit" className="button button-primary" name="intent" value="publish"
                disabled={busy || uploading}>{publicationWord}</button>}
            </>
          )}
        </div>
        {canSaveCopy && (
          <div className="page-actions editor-management">
            {targetLost && <button type="submit" hidden disabled />}
            <button type="button" className="button button-outline" onClick={() => void copyBody()}>复制正文</button>
            <details>
              <summary>另存为新草稿</summary>
              <p>把当前编辑内容保存为一篇新草稿。</p>
              <button type="submit" className="button button-primary" name="intent" value="copy_draft"
                disabled={busy || uploading}>确认另存为新草稿</button>
            </details>
            {copyBodyNotice && <p role="status">{copyBodyNotice}</p>}
          </div>
        )}
        {article && !targetLost && (
          <div className="page-actions editor-management">
            {isPublished && (
              <details>
                <summary>下架文章</summary>
                <p>下架后，访客无法通过原链接查看文章。需要保留当前编辑时，请先更新文章。</p>
                <button className="button button-outline" type="submit" name="intent" value="unpublish" disabled={busy || uploading}>确认下架</button>
              </details>
            )}
            <details>
              <summary>删除文章</summary>
              <p>确认删除「{article.title || "未命名文章"}」？</p>
              <button className="button button-outline editor-error" type="submit" name="intent" value="delete" disabled={busy || uploading}>确认删除</button>
            </details>
          </div>
        )}
      </Form>
      {preview.data && (
        <section className="editor-preview" aria-label="当前内容预览">
          <h2>当前内容预览</h2>
          {"html" in preview.data ? (
            <>
              <h3>{preview.data.title || "未命名文章"}</h3>
              {preview.data.summary && <p>{preview.data.summary}</p>}
              {preview.data.cover_media_id && (
                <ImageWithFallback className="article-cover" alt="文章封面"
                  src={`/api/v1/admin/media/${preview.data.cover_media_id}/content`} />
              )}
              {preview.data.missing_images.length > 0 && (
                <div role="alert" className="editor-error">
                  <p>以下图片已失效：</p>
                  <ul>{preview.data.missing_images.map((path) => <li key={path}>{path}</li>)}</ul>
                </div>
              )}
              <MarkdownBody html={preview.data.html} toc={preview.data.toc} />
            </>
          ) : <p role="alert" className="editor-error">{preview.data.message}</p>}
        </section>
      )}
    </section>
  );
}
