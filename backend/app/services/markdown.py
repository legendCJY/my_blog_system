from dataclasses import dataclass
from html import escape
import re
import unicodedata
from uuid import UUID

from markdown_it import MarkdownIt
from markdown_it.token import Token
import nh3
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound


@dataclass
class RenderedArticle:
    html: str
    toc: list[dict]
    search_text: str
    media_ids: dict[UUID, str]
    invalid_images: list[str]


def _highlight(code: str, language: str, _attrs: str) -> str:
    if language:
        try:
            return highlight(code, get_lexer_by_name(language), HtmlFormatter(nowrap=True))
        except ClassNotFound:
            pass
    return escape(code)


markdown = MarkdownIt("commonmark", {"html": False, "highlight": _highlight}).enable("table")
cleaner = nh3.Cleaner(
    tags={
        "a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6",
        "hr", "img", "li", "ol", "p", "pre", "s", "span", "strong",
        "table", "tbody", "td", "th", "thead", "tr", "ul",
    },
    attributes={
        **{f"h{i}": {"id"} for i in range(1, 7)},
        "a": {"href", "title"}, "img": {"src", "alt", "title"},
        "ol": {"start"}, "span": {"class"}, "code": {"class"},
    },
    url_schemes={"http", "https", "mailto"},
)


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"[\W_]+", "-", value).strip("-")


def _inline_text(tokens: list[Token]) -> str:
    return "".join(
        _inline_text(token.children)
        if token.children
        else " " if token.type in {"softbreak", "hardbreak"} else token.content
        for token in tokens
    )


def render_article(source: str, *, private: bool = False, allow_images: bool = True) -> RenderedArticle:
    environment: dict = {}
    tokens = markdown.parse(source, environment)
    toc: list[dict] = []
    used_anchors: set[str] = set()
    search_parts: list[str] = []
    media_ids: dict[UUID, str] = {}
    invalid_images: list[str] = []

    for position, token in enumerate(tokens):
        if token.type == "heading_open":
            title = _inline_text(tokens[position + 1].children or []).strip()
            base = slugify(title)[:100] or "heading"
            anchor = f"heading-{base}"
            suffix = 2
            while anchor in used_anchors:
                anchor = f"heading-{base}-{suffix}"
                suffix += 1
            used_anchors.add(anchor)
            token.attrSet("id", anchor)
            toc.append({"id": anchor, "title": title, "level": int(token.tag[1])})
        if token.type in {"fence", "code_block"}:
            search_parts.append(token.content)
        if token.type != "inline":
            continue
        search_parts.append(_inline_text(token.children or []))
        for inline in token.children or []:
            if inline.type != "image":
                continue
            if not allow_images:
                inline.type = "text"
                inline.content = _inline_text(inline.children or [])
                continue
            src = inline.attrGet("src")
            if not isinstance(src, str) or not src.startswith("/media/"):
                continue
            try:
                media_id = UUID(src.removeprefix("/media/"))
            except ValueError:
                invalid_images.append(src)
                continue
            media_ids[media_id] = src
            inline.attrSet(
                "src",
                f"/api/v1/admin/media/{media_id}/content" if private else f"/media/{media_id}",
            )

    return RenderedArticle(
        html=cleaner.clean(markdown.renderer.render(tokens, markdown.options, environment)),
        toc=toc,
        search_text=" ".join(" ".join(search_parts).split()),
        media_ids=media_ids,
        invalid_images=list(dict.fromkeys(invalid_images)),
    )
