import { redirect } from "react-router";

export function loader() {
  return redirect("/admin/articles");
}

export default function AdminIndex() {
  return null;
}
