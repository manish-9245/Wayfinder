import { highlightCode, langLabel } from "@/lib/highlight";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
      const url = /^(https?:|data:|\/)/.test(src) ? src : `/api/docs-files/${src}`;
      return `<img src="${url}" alt="${alt}" loading="lazy" />`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

const slugCounts = new Map<string, number>();
function slugify(text: string): string {
  const base = text
    .replace(/[*_`[\]()]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const n = slugCounts.get(base) ?? 0;
  slugCounts.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

/** Minimal markdown: fences (highlighted, adjacent multi-lang grouped into tabs),
 *  h1-h4 (h2/h3 anchored), tables, lists, hr, paragraphs. */
export function md(src: string): string {
  slugCounts.clear();
  const lines = src.split("\n");
  let html = "", i = 0;
  let inFence = false, fenceLang = "";
  let fenceBuf: string[] = [];
  let figures: { lang: string; code: string }[] = [];
  const flushFigures = () => {
    if (!figures.length) return;
    const langs = figures.map((f) => f.lang.toLowerCase());
    const tabbed = figures.length >= 2 && new Set(langs).size === figures.length;
    const renderFigure = (lang: string, code: string, extra: string) => {
      const label = langLabel(lang);
      return `<figure class="codeblock"${extra}><figcaption><span>${label}</span><button type="button" data-copy="1">Copy</button></figcaption>` +
        `<pre data-lang="${lang}"><code>${highlightCode(lang, code)}</code></pre></figure>`;
    };
    if (tabbed) {
      html += `<div class="codetabs" data-codetabs><div role="tablist" aria-label="Language">` +
        figures.map((f, idx) =>
          `<button type="button" role="tab" data-tab="${idx}" aria-selected="${idx === 0}"${idx === 0 ? "" : ' tabindex="-1"'}>${langLabel(f.lang)}</button>`
        ).join("") + `</div>` +
        figures.map((f, idx) => renderFigure(f.lang, f.code, ` role="tabpanel" data-panel="${idx}"${idx === 0 ? "" : " hidden"}`)).join("") +
        `</div>`;
    } else {
      for (const f of figures) html += renderFigure(f.lang, f.code, "");
    }
    figures = [];
  };
  let buf: string[] = [], inList = false;
  let inTable: string[] = [];
  const flushP = () => { if (buf.length) { html += `<p>${inline(buf.join(" "))}</p>`; buf = []; } };
  const flushList = () => { if (inList) { html += "</ul>"; inList = false; } };
  const flushTable = () => {
    if (!inTable.length) return;
    const rows = inTable.map((r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    html += "<table><thead><tr>" + rows[0].map((c) => `<th scope="col">${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
      rows.slice(2).map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table>";
    inTable = [];
  };
  while (i < lines.length) {
    const ln = lines[i];
    const fence = ln.match(/^```(\w*)\s*$/);
    if (fence) {
      if (inFence) {
        figures.push({ lang: fenceLang, code: fenceBuf.join("\n") });
        inFence = false; fenceLang = ""; fenceBuf = [];
      } else {
        flushP(); flushList(); flushTable();
        inFence = true; fenceLang = fence[1] || "";
      }
      i++; continue;
    }
    if (inFence) { fenceBuf.push(ln); i++; continue; }
    if (/^\|.*\|$/.test(ln)) { flushP(); flushList(); flushFigures(); inTable.push(ln); i++; continue; }
    if (inTable.length) { flushTable(); continue; }
    const h = ln.match(/^(#{1,4}) (.*)/);
    if (h) {
      flushP(); flushList(); flushFigures();
      const level = h[1].length;
      const text = inline(h[2]);
      if (level === 2 || level === 3) {
        const id = slugify(h[2]);
        html += `<h${level} id="${id}">${text}</h${level}>`;
      } else {
        html += `<h${level}>${text}</h${level}>`;
      }
      i++; continue;
    }
    if (/^---+$/.test(ln)) { flushP(); flushList(); flushFigures(); html += "<hr>"; i++; continue; }
    if (/^([-*]|\d+\.) /.test(ln)) {
      flushP(); flushFigures(); if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(ln.replace(/^([-*]|\d+\.) /, ""))}</li>`; i++; continue;
    }
    if (!ln.trim()) { flushP(); flushList(); i++; continue; }
    if (buf.length === 0) flushFigures();
    buf.push(ln.trim()); i++;
  }
  flushP(); flushList(); flushTable(); flushFigures();
  if (inFence) {
    figures.push({ lang: fenceLang, code: fenceBuf.join("\n") });
    flushFigures();
  }
  return html;
}

export interface TocEntry { id: string; text: string; level: number }

/** On-this-page entries from anchored h2/h3 headings (plain-text titles). */
export function extractToc(html: string): TocEntry[] {
  const out: TocEntry[] = [];
  const re = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push({ level: Number(m[1]), id: m[2], text: m[3].replace(/<[^>]+>/g, "") });
  }
  return out;
}
