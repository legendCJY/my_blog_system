import { NavLink } from "react-router";

export function AdminNavigation() {
  return (
    <nav aria-label="后台导航" className="admin-navigation">
      <NavLink to="/admin/articles">文章</NavLink>
      <NavLink to="/admin/categories">分类</NavLink>
      <NavLink to="/admin/tags">标签</NavLink>
      <NavLink to="/admin/about">关于页</NavLink>
    </nav>
  );
}
