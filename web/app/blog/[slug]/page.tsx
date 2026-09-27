import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, listPosts } from "@/lib/blog";
import { extractToc, md } from "@/lib/md";
import { Mermaid } from "@/components/mermaid";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function generateStaticParams() {
  return listPosts().map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) return { title: "Not found" };
  return {
    title: post.title,
    description: post.blurb,
    openGraph: { title: post.title, description: post.blurb, type: "article" },
  };
}

type Segment = { kind: "md"; html: string } | { kind: "mermaid"; chart: string };

const MERMAID_RE = /^```mermaid\s*$\n([\s\S]*?)^```/gm;

/** Split ```mermaid fences out; everything else renders through the shared
 *  markdown renderer (code tabs, tables, anchored h2/h3 for the index). */
function segment(body: string): { segments: Segment[]; tocHtml: string } {
  const segments: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MERMAID_RE.lastIndex = 0;
  while ((m = MERMAID_RE.exec(body))) {
    const before = body.slice(last, m.index).trim();
    if (before) segments.push({ kind: "md", html: md(before) });
    if (m[1].trim()) segments.push({ kind: "mermaid", chart: m[1].trim() });
    last = m.index + m[0].length;
  }
  const tail = body.slice(last).trim();
  if (tail) segments.push({ kind: "md", html: md(tail) });
  const tocHtml = md(body.replace(/^```mermaid\s*$\n[\s\S]*?^```/gm, ""));
  return { segments, tocHtml };
}

export default function BlogPost({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) notFound();
  const { segments, tocHtml } = segment(post.body);
  const toc = extractToc(tocHtml);
  const siblings = listPosts();
  const idx = siblings.findIndex((p) => p.slug === post.slug);
  const prev = siblings[idx + 1];
  const next = siblings[idx - 1];

  return (
    <div className="mt-6">
      <nav aria-label="Breadcrumb" className="mb-4 font-tsj-mono text-[11px] uppercase tracking-[0.14em]">
        <Link href="/blog" className="text-muted-foreground hover:text-ember hover:underline">
          ← All guides
        </Link>
      </nav>
      <p className="eyebrow">{post.tag}</p>
      <h1 className="mb-3 mt-2 max-w-[22ch] font-tsj-display text-3xl font-bold tracking-tight md:text-5xl">
        {post.title}
      </h1>
      <p className="mb-2 flex flex-wrap items-center gap-2 font-tsj-mono text-[11px] text-muted-foreground">
        <Badge variant="outline">{post.tag}</Badge>
        <span>{post.date}</span>
        <span aria-hidden="true">·</span>
        <span>{post.minutes} min read</span>
        <span aria-hidden="true">·</span>
        <span>{post.section}</span>
      </p>
      <p className="mb-8 max-w-[68ch] text-[15px] text-muted-foreground">{post.blurb}</p>

      <div className="grid items-start gap-8 md:grid-cols-[250px_1fr]">
        {toc.length > 0 && (
          <nav aria-label="On this page" className="hairline-t md:sticky md:top-24">
            <p className="eyebrow mb-2 mt-4">On this page</p>
            <ul className="grid gap-1.5 pb-4">
              {toc.map((t) => (
                <li key={t.id} className={cn(t.level === 3 && "ml-4")}>
                  <a
                    href={`#${t.id}`}
                    className="font-tsj-mono text-xs text-muted-foreground hover:text-ember hover:underline"
                  >
                    {t.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <Card className="min-w-0 border-white/15 bg-card/55 shadow-[0_8px_32px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-2xl backdrop-saturate-150">
          <CardContent className="doc-body pt-6">
            {segments.map((s, i) =>
              s.kind === "mermaid" ? (
                <Mermaid key={i} chart={s.chart} />
              ) : (
                <div key={i} dangerouslySetInnerHTML={{ __html: s.html }} />
              )
            )}
          </CardContent>
        </Card>
      </div>

      <nav aria-label="More guides" className="mt-10 grid gap-3 sm:grid-cols-2">
        {prev ? (
          <Link
            href={`/blog/${prev.slug}`}
            className="hairline-t hairline-b group px-1 py-4 transition-colors hover:bg-accent/40"
          >
            <span className="font-tsj-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              ← Older
            </span>
            <span className="block font-tsj-grot font-semibold group-hover:text-ember group-hover:underline">
              {prev.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={`/blog/${next.slug}`}
            className="hairline-t hairline-b group px-1 py-4 text-right transition-colors hover:bg-accent/40"
          >
            <span className="font-tsj-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Newer →
            </span>
            <span className="block font-tsj-grot font-semibold group-hover:text-ember group-hover:underline">
              {next.title}
            </span>
          </Link>
        )}
      </nav>
    </div>
  );
}
