import type { Route } from "./+types/admin-categories";
import { AdminTaxonomy } from "../components/admin-taxonomy";
import { loadTaxonomy, saveTaxonomy } from "../lib/admin-taxonomy.server";

export function meta(): Route.MetaDescriptors {
  return [{ title: "分类管理 · 个人博客" }];
}

export function loader({ request }: Route.LoaderArgs) {
  return loadTaxonomy(request, "categories");
}

export function action({ request }: Route.ActionArgs) {
  return saveTaxonomy(request, "categories");
}

export default function GroupManagement({ loaderData, actionData }: Route.ComponentProps) {
  return <AdminTaxonomy {...loaderData} group="categories" issue={actionData} />;
}
