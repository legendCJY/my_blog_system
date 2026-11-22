import { Form, Link, useNavigation, useSearchParams } from "react-router";
import { groupLabels, type Group, type TaxonomyEntry } from "../lib/directory";
import { AdminNavigation } from "./admin-navigation";

export function AdminTaxonomy({ group, entries, csrf, issue }: {
  group: Group; entries: TaxonomyEntry[]; csrf: string;
  issue?: { message: string; code: string; attemptedName?: string };
}) {
  const label = groupLabels[group];
  const [query] = useSearchParams();
  const done = query.get("done");
  const busy = useNavigation().state !== "idle";
  const success = done === "create" ? "已新增" : done === "rename" ? "已改名" : done === "delete" ? "已删除" : "";

  return (
    <section className="listing-page">
      <AdminNavigation />
      <div className="admin-heading">
        <h1>{label}管理</h1>
        <Link to={`/${group}`}>查看前台{label}</Link>
      </div>
      {issue && (
        <div className="editor-error" role="alert">
          <p>{issue.message}</p>
          {issue.attemptedName && <p>你输入的名称是「{issue.attemptedName}」。</p>}
          {issue.code === "taxonomy_not_found" && <Link to={`/admin/${group}`}>返回{label}列表</Link>}
        </div>
      )}
      {!issue && success && <p className="editor-success" role="status">{success}{label}。</p>}
      <Form method="post" className="editor-form taxonomy-create">
        <input type="hidden" name="csrf_token" value={csrf} />
        <label className="editor-field">新{label}名称
          <input name="name" required maxLength={80} />
        </label>
        <button className="button button-primary" type="submit" name="intent" value="create" disabled={busy}>
          新增{label}
        </button>
      </Form>
      {entries.length ? (
        <ul className="admin-taxonomy-list">
          {entries.map((item) => (
            <li key={item.id}>
              <div className="taxonomy-item-heading">
                <Link to={`/${group}/${encodeURIComponent(item.slug)}`}>{item.name}</Link>
                <span>关联 {item.article_count} 篇文章</span>
              </div>
              <Form method="post" className="taxonomy-rename editor-form" key={item.name}>
                <input type="hidden" name="csrf_token" value={csrf} />
                <input type="hidden" name="id" value={item.id} />
                <label className="editor-field">名称
                  <input name="name" defaultValue={item.name} required maxLength={80} />
                </label>
                <button type="submit" name="intent" value="rename" className="button button-outline" disabled={busy}>
                  保存名称
                </button>
              </Form>
              <details className="taxonomy-delete">
                <summary>删除{label}</summary>
                <p>删除「{item.name}」会移除 {item.article_count} 篇文章的{label}关联，文章会保留。</p>
                <Form method="post">
                  <input type="hidden" name="csrf_token" value={csrf} />
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" name="intent" value="delete" className="button button-outline editor-error" disabled={busy}>
                    确认删除
                  </button>
                </Form>
              </details>
            </li>
          ))}
        </ul>
      ) : <div className="empty-state"><h2>暂无{label}</h2></div>}
    </section>
  );
}
