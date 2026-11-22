import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/admin-login";
import { adminRequest, readAdminSession, safeReturnPath, sessionRedirect } from "../lib/admin.server";

export function meta(): Route.MetaDescriptors {
  return [{ title: "管理员登录 · 个人博客" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const returnTo = safeReturnPath(new URL(request.url).searchParams.get("return_to"));
  if (await readAdminSession(request)) {
    throw redirect(returnTo);
  }
  return { returnTo };
}

export async function action({ request }: Route.ActionArgs) {
  const fields = await request.formData();
  const returnTo = safeReturnPath(fields.get("return_to"));
  const username = String(fields.get("username") ?? "").trim();
  const password = String(fields.get("password") ?? "");

  if (!username || username.length > 120 || !password || password.length > 1024) {
    return data({ username, message: "请输入有效的用户名和密码。" }, { status: 400 });
  }

  const response = await adminRequest(request, "api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const message = response.status === 401
      ? "账号或密码不正确。"
      : response.status === 429
        ? "登录尝试次数过多，请稍后重试。"
        : response.status === 403
          ? "请从博客的登录页重新提交。"
          : "暂时无法登录，请稍后重试。";
    return data({ username, message }, { status: response.status });
  }
  if (!response.headers.has("set-cookie")) {
    throw data(null, { status: 502 });
  }
  return sessionRedirect(returnTo, response);
}

export default function AdminLogin({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <section className="message-page login-page">
      <h1>管理员登录</h1>
      <Form className="login-form" method="post" reloadDocument>
        <input type="hidden" name="return_to" value={loaderData.returnTo} />
        <label>
          用户名
          <input name="username" autoComplete="username" maxLength={120} required defaultValue={actionData?.username} />
        </label>
        <label>
          密码
          <input name="password" type="password" autoComplete="current-password" maxLength={1024} required />
        </label>
        {actionData?.message && <p role="alert" className="form-error">{actionData.message}</p>}
        <button className="button button-primary" type="submit">登录</button>
      </Form>
    </section>
  );
}
