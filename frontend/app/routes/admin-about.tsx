import { useRef, useState, type ChangeEvent } from "react";
import { data, Form, Link, redirectDocument, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/admin-about";
import { AdminNavigation } from "../components/admin-navigation";
import { ImageWithFallback } from "../components/image-with-fallback";
import { adminRequest, loginPageFor, requireAdminSession } from "../lib/admin.server";
import type { AboutContent, SocialLink } from "../lib/directory";
import { editorIssue, editorRequest } from "../lib/editor.server";
import { uploadMedia } from "../lib/upload";

const endpoint = "api/v1/admin/about";

export function meta(): Route.MetaDescriptors {
  return [{ title: "关于页设置 · 个人博客" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdminSession(request);
  const response = await adminRequest(request, endpoint);
  if (response.status === 401) throw loginPageFor(request);
  if (!response.ok) throw data(null, { status: response.status });
  return { content: await response.json() as AboutContent, csrf: admin.csrf_token };
}

export async function action({ request }: Route.ActionArgs) {
  const fields = await request.formData();
  const names = fields.getAll("link_name").map((value) => String(value).trim());
  const urls = fields.getAll("link_url").map((value) => String(value).trim());
  const links = names.map((name, index) => ({ name, url: urls[index] ?? "" }))
    .filter((link) => link.name || link.url);
  const content = {
    bio_md: String(fields.get("bio_md") ?? ""),
    avatar_media_id: String(fields.get("avatar_media_id") ?? "") || null,
    links,
  };
  const response = await editorRequest(request, endpoint, "PUT", content, String(fields.get("csrf_token") ?? ""));
  if (response.ok) return redirectDocument("/admin/about?saved=1", { status: 303 });
  const issue = (await editorIssue(response)).data;
  return data({
    content,
    message: response.status === 422 ? "请检查介绍长度，并为每项社交链接填写名称和完整的 http 或 https 地址。" : issue.message,
  }, { status: response.status });
}

type LinkRow = SocialLink & { key: number };

export default function AboutSettings({ loaderData, actionData }: Route.ComponentProps) {
  const values = actionData?.content ?? loaderData.content;
  const [avatar, setAvatar] = useState(values.avatar_media_id);
  const [links, setLinks] = useState<LinkRow[]>(() => values.links.map((link, key) => ({ ...link, key })));
  const nextKey = useRef(links.length);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const busy = useNavigation().state !== "idle" || uploading;
  const [query] = useSearchParams();

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const result = await uploadMedia(file, loaderData.csrf);
      setAvatar(result.id);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "头像上传失败，请重试。");
    } finally {
      setUploading(false);
    }
  }

  function addLink() {
    const key = nextKey.current++;
    setLinks((rows) => [...rows, { key, name: "", url: "" }]);
  }

  return (
    <section className="listing-page">
      <AdminNavigation />
      <div className="admin-heading">
        <h1>关于页设置</h1>
        <Link to="/about">查看前台关于页</Link>
      </div>
      {actionData && <p className="editor-error" role="alert">{actionData.message}</p>}
      {!actionData && query.has("saved") && <p className="editor-success" role="status">关于页已更新。</p>}
      <Form method="post" className="editor-form">
        <input type="hidden" name="csrf_token" value={loaderData.csrf} />
        <input type="hidden" name="avatar_media_id" value={avatar ?? ""} />
        <div className="editor-cover">
          {avatar && <ImageWithFallback className="profile-avatar" src={`/api/v1/admin/media/${encodeURIComponent(avatar)}/content`} alt="当前头像" />}
          <label className="editor-field">上传头像
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadAvatar} disabled={busy} />
          </label>
          {avatar && <button className="button button-outline" type="button" onClick={() => setAvatar(null)} disabled={busy}>移除头像</button>}
        </div>
        {uploading && <p role="status">正在上传头像…</p>}
        {uploadError && <p className="editor-error" role="alert">{uploadError}</p>}
        <label className="editor-field">个人介绍（支持 Markdown）
          <textarea name="bio_md" rows={8} defaultValue={values.bio_md} maxLength={20000} />
        </label>
        <fieldset className="social-settings">
          <legend>社交链接</legend>
          {links.map((link, index) => (
            <div className="social-inputs" key={link.key}>
              <label className="editor-field">链接 {index + 1} 的名称
                <input name="link_name" defaultValue={link.name} maxLength={80} />
              </label>
              <label className="editor-field">链接 {index + 1} 的网址
                <input name="link_url" type="url" defaultValue={link.url} maxLength={2083} placeholder="https://" />
              </label>
              <button className="button button-outline" type="button" onClick={() =>
                setLinks((rows) => rows.filter((row) => row.key !== link.key))} disabled={busy}>移除链接</button>
            </div>
          ))}
          <button className="button button-outline" type="button" onClick={addLink} disabled={busy || links.length >= 10}>
            添加社交链接
          </button>
        </fieldset>
        <div className="page-actions">
          <button className="button button-primary" type="submit" disabled={busy}>保存关于页</button>
        </div>
      </Form>
    </section>
  );
}
