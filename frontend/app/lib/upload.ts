export async function uploadMedia(file: File, csrf: string): Promise<{ id: string; url: string }> {
  if (file.size > 4 * 1024 * 1024) throw new Error("图片大小上限为 4 MiB。");
  const fields = new FormData();
  fields.set("file", file);
  const response = await fetch("/api/v1/admin/media", {
    method: "POST", headers: { "X-CSRF-Token": csrf }, body: fields,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.id || !result?.url) {
    throw new Error(result?.message || "图片上传失败，请稍后重试。");
  }
  return result;
}
