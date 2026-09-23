const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

/** Minimal markdown: fences, h1-h4, tables, lists, hr, paragraphs. */
export function md(src: string): string {
  const lines = src.split("\n");
  let html = "", i = 0, inCode = false;
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
    if (/^```/.test(ln)) { html += inCode ? "</code></pre>" : "<pre><code>"; inCode = !inCode; i++; continue; }
    if (inCode) { html += esc(ln) + "\n"; i++; continue; }
    if (/^\|.*\|$/.test(ln)) { flushP(); flushList(); inTable.push(ln); i++; continue; }
    if (inTable.length) { flushTable(); continue; }
    const h = ln.match(/^(#{1,4}) (.*)/);
    if (h) { flushP(); flushList(); html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; i++; continue; }
    if (/^---+$/.test(ln)) { flushP(); flushList(); html += "<hr>"; i++; continue; }
    if (/^([-*]|\d+\.) /.test(ln)) {
      flushP(); if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(ln.replace(/^([-*]|\d+\.) /, ""))}</li>`; i++; continue;
    }
    if (!ln.trim()) { flushP(); flushList(); i++; continue; }
    buf.push(ln.trim()); i++;
  }
  flushP(); flushList(); flushTable();
  return html;
}
