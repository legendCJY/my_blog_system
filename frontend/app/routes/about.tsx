import type { Route } from "./+types/about";
import { ImageWithFallback } from "../components/image-with-fallback";
import { MarkdownBody } from "../components/markdown-body";
import type { PublicAbout } from "../lib/directory";
import { publicResponse } from "../lib/public-articles.server";

export function meta(): Route.MetaDescriptors {
  return [{ title: "关于 · 个人博客" }];
}

export function loader() {
  return publicResponse<PublicAbout>("api/v1/public/about");
}

export default function About({ loaderData: { bio_html: bio, avatar_url: avatar, links } }: Route.ComponentProps) {
  return (
    <section className="listing-page">
      <div className="listing-header"><h1>关于</h1></div>
      {bio || avatar || links.length ? (
        <div className="profile-card">
          {avatar && <ImageWithFallback className="profile-avatar" src={avatar} alt="博主头像" />}
          <div className="profile-content">
            {bio && <MarkdownBody html={bio} toc={[]} />}
            {links.length > 0 && (
              <ul className="article-tags" aria-label="社交链接">
                {links.map((link, index) => <li key={index}><a href={link.url} rel="me">{link.name}</a></li>)}
              </ul>
            )}
          </div>
        </div>
      ) : <div className="empty-state"><h2>博主还没有填写介绍</h2></div>}
    </section>
  );
}
