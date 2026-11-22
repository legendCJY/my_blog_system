import { useEffect, useState } from "react";

const redirectSeconds = 8;

export type MissingPageKind = "page" | "article" | "admin";

export function missingPageKind(pathname: string): MissingPageKind {
  if (/^\/admin(?:\/|$)/i.test(pathname)) return "admin";
  if (/^\/articles\/[^/]+\/?$/i.test(pathname)) return "article";
  return "page";
}

export function NotFoundPage({ kind }: { kind: MissingPageKind }) {
  const [cancelled, setCancelled] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (cancelled || kind === "admin") return;

    const deadline = performance.now() + redirectSeconds * 1_000;
    setRemaining(redirectSeconds);
    const countdown = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((deadline - performance.now()) / 1_000)));
    }, 250);
    const redirect = window.setTimeout(() => {
      window.location.replace("/");
    }, redirectSeconds * 1_000);

    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(redirect);
    };
  }, [cancelled, kind]);

  return (
    <section className="message-page">
      <p className="status-code">404</p>
      <h1>{kind === "article" ? "这篇文章当前无法访问" : "找不到这个页面"}</h1>
      {kind === "admin" ? (
        <p>请检查后台地址，或返回后台继续管理文章。</p>
      ) : (
        <p>你可以返回首页，或在站内搜索文章。</p>
      )}
      <div className="page-actions">
        {kind === "admin" ? (
          <a className="button button-primary" href="/admin/articles">返回后台</a>
        ) : (
          <>
            <a className="button button-primary" href="/">立即返回首页</a>
            <a className="button button-outline" href="/search" onClick={() => setCancelled(true)}>
              搜索文章
            </a>
          </>
        )}
      </div>
      {remaining !== null && !cancelled && (
        <div className="countdown">
          <span>{remaining} 秒后将自动返回首页</span>
          <button className="text-button" type="button" onClick={() => setCancelled(true)}>
            取消自动跳转
          </button>
        </div>
      )}
      {cancelled && <p className="countdown" role="status">已取消自动跳转。</p>}
    </section>
  );
}
