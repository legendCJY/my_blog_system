import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import type { ReactNode } from "react";
import type { Route } from "./+types/root";
import { missingPageKind, NotFoundPage } from "./components/not-found-page";
import "./styles/site.css";

export const headers: Route.HeadersFunction = () => ({
  "Cache-Control": "no-store",
});

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <a className="skip-link" href="#main">跳到正文</a>
        <header className="site-header">
          <div className="shell header-inner">
            <Link to="/" className="wordmark">个人博客</Link>
            <nav aria-label="主导航" className="site-navigation">
              <Link to="/categories">分类</Link>
              <Link to="/tags">标签</Link>
              <Link to="/archive">归档</Link>
              <Link to="/about">关于</Link>
              <Link to="/search">搜索</Link>
              <Link to="/admin">后台</Link>
            </nav>
          </div>
        </header>
        <main id="main" className="shell">{children}</main>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { pathname } = useLocation();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage key={pathname} kind={missingPageKind(pathname)} />;
  }
  if (isRouteErrorResponse(error) && error.status === 405) {
    return (
      <section className="message-page">
        <h1>此页面不支持该请求方式</h1>
        <a className="button button-primary" href="/">返回首页</a>
      </section>
    );
  }

  return (
    <section className="message-page">
      <h1>暂时无法加载页面</h1>
      <p>请稍后再试。</p>
      <div className="page-actions">
        <a className="button button-primary" href="">重新加载</a>
        <a className="button button-outline" href="/">返回首页</a>
      </div>
    </section>
  );
}
