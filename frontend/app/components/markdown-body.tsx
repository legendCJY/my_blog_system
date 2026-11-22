import { useEffect, useRef } from "react";
import type { OutlineEntry } from "../lib/articles";
import { isBrokenImage, missingImageLabel } from "./image-with-fallback";

function showImagePlaceholder(image: HTMLImageElement) {
  const label = missingImageLabel(image.alt);
  const placeholder = document.createElement("span");
  placeholder.className = "image-placeholder";
  placeholder.setAttribute("role", "img");
  placeholder.setAttribute("aria-label", label);
  placeholder.textContent = label;
  image.replaceWith(placeholder);
}

export function MarkdownBody({ html, toc }: { html: string; toc: OutlineEntry[] }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = body.current;
    if (!container) return;

    function handleImageError(event: Event) {
      if (event.target instanceof HTMLImageElement) showImagePlaceholder(event.target);
    }

    container.addEventListener("error", handleImageError, true);
    for (const image of container.querySelectorAll("img")) {
      if (isBrokenImage(image)) showImagePlaceholder(image);
    }
    return () => container.removeEventListener("error", handleImageError, true);
  }, [html]);

  return (
    <>
      {toc.length > 0 && (
        <nav className="article-outline" aria-label="文章目录">
          <strong>目录</strong>
          <ul>
            {toc.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.title || "未命名标题"}</a></li>)}
          </ul>
        </nav>
      )}
      <div className="markdown-body" ref={body} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
