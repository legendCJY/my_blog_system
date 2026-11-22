import { Link } from "react-router";

export function AdminArticleMissing() {
  return (
    <section className="message-page">
      <p className="status-code">404</p>
      <h1>这条记录已不可用</h1>
      <Link className="button button-primary" to="/admin/articles">返回文章管理</Link>
    </section>
  );
}
