import type { Route } from "./+types/admin-tags";
import { AdminTaxonomy } from "../components/admin-taxonomy";
import { loadTaxonomy, saveTaxonomy } from "../lib/admin-taxonomy.server";

export function meta(): Route.MetaDescriptors {
  return [{ title: "标签管理 · 个人博客" }];
}

export function loader({ request }: Route.LoaderArgs) {
  return loadTaxonomy(request, "tags");
}

export function action({ request }: Route.ActionArgs) {
  return saveTaxonomy(request, "tags");
}

export default function GroupManagement({ loaderData, actionData }: Route.ComponentProps) {
  return <AdminTaxonomy {...loaderData} group="tags" issue={actionData} />;
}
