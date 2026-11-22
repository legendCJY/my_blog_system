import { data, redirect, useLocation } from "react-router";
import type { Route } from "./+types/not-found";
import { missingPageKind, NotFoundPage } from "../components/not-found-page";
import { legacyDestination } from "../lib/legacy-paths.server";

export function meta(): Route.MetaDescriptors {
  return [{ title: "页面不存在 · 个人博客" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const pathname = new URL(request.url).pathname;
  const destination = legacyDestination(pathname);
  if (destination) return redirect(destination, { status: 308 });
  return data({ kind: missingPageKind(pathname) }, { status: 404 });
}

export function action({ request }: Route.ActionArgs) {
  const pathname = new URL(request.url).pathname;
  if (legacyDestination(pathname)) {
    throw data(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  return data({ kind: missingPageKind(pathname) }, { status: 404 });
}

export default function UnmatchedRoute({ loaderData }: Route.ComponentProps) {
  const { pathname } = useLocation();
  return <NotFoundPage key={pathname} kind={loaderData.kind} />;
}
