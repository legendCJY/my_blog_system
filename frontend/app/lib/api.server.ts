export function fetchApi(path: string, init: RequestInit = {}) {
  const backend = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:8000";
  const base = backend.endsWith("/") ? backend : `${backend}/`;
  return fetch(new URL(path, base), {
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(5_000),
    ...init,
  });
}
