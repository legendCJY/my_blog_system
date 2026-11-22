import { data } from "react-router";
import type { PublicArticleDetail, PublicArticlePage } from "./articles";
import { fetchApi } from "./api.server";

export async function publicResponse<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetchApi(path);
  } catch {
    throw data(null, { status: 503 });
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw data({ code: error.code, total_pages: error.details?.total_pages }, { status: response.status });
  }
  return response.json();
}

export function publicArticlePage(page: string, query: string, year?: string): Promise<PublicArticlePage> {
  const params = new URLSearchParams({ page, q: query });
  if (year !== undefined) params.set("year", year);
  return publicResponse(`api/v1/public/articles?${params}`);
}

export function publicArticle(slug: string): Promise<PublicArticleDetail> {
  return publicResponse(`api/v1/public/articles/${encodeURIComponent(slug)}`);
}
