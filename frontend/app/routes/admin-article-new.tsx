import type { Route } from "./+types/admin-article-new";
import { ArticleEditor } from "../components/article-editor";
import { loadArticleEditor, saveEditor } from "../lib/editor.server";

export function meta(): Route.MetaDescriptors {
  return [{ title: "新建文章 · 个人博客" }];
}

export function loader({ request }: Route.LoaderArgs) {
  return loadArticleEditor(request);
}

export function action({ request }: Route.ActionArgs) {
  return saveEditor(request);
}

export default function NewArticle({ loaderData, actionData }: Route.ComponentProps) {
  return <ArticleEditor {...loaderData} notice={actionData}
    content={actionData?.recovery?.content ?? loaderData.content}
    newId={actionData?.recovery?.newId ?? loaderData.newId} />;
}
