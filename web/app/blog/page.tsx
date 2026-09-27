import Link from "next/link";
import { listPosts, type PostMeta } from "@/lib/blog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Blog",
  description:
    "Build guides for every Wayfinder use case — lead scoring, SEO at scale, support triage, agent safety — plus production setup on Railway, Docker, and local MCP.",
};

function Row({ post, i }: { post: PostMeta; i: number }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="hairline-b group grid w-full grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 px-1 py-5 text-left transition-colors hover:bg-accent/40"
    >
      <span className="section-num text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
      <span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-tsj-grot text-[17px] font-semibold group-hover:text-ember group-hover:underline">
            {post.title}
          </span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2 font-tsj-mono text-[11px] text-muted-foreground">
          <Badge variant="outline">{post.tag}</Badge>
          <span>{post.date}</span>
          <span aria-hidden="true">·</span>
          <span>{post.minutes} min read</span>
        </span>
        <span className="mt-1.5 block max-w-[72ch] text-[13px] text-muted-foreground">{post.blurb}</span>
      </span>
    </Link>
  );
}

export default function BlogIndex() {
  const posts = listPosts();
  const sections: ("Use cases" | "Setup guides")[] = ["Use cases", "Setup guides"];
  let n = 0;
  return (
    <div className="mt-6">
      <p className="eyebrow">Wayfinder — blog</p>
      <h1 className="mb-3 mt-2 font-tsj-display text-3xl font-bold tracking-tight md:text-4xl">
        Build guides, not press releases
      </h1>
      <p className="mb-10 max-w-[68ch] text-sm text-muted-foreground">
        Every post is a working recipe: the problem, the architecture, the exact calls to make,
        what it costs, and where it breaks. Ten product use cases plus the setup guides for
        every platform we run on.
      </p>
      {sections.map((section) => {
        const items = posts.filter((p) => p.section === section);
        if (!items.length) return null;
        return (
          <section key={section} aria-label={section} className="mb-12">
            <div className="mb-3 flex items-baseline gap-4">
              <span className="section-num">{section === "Use cases" ? "01" : "02"}</span>
              <h2 className={cn("font-tsj-display text-xl font-bold tracking-tight")}>{section}</h2>
              <span className="ml-auto hidden font-tsj-mono text-[11px] text-muted-foreground sm:block">
                {items.length} guides
              </span>
            </div>
            <div className="hairline-t" role="list">
              {items.map((p) => (
                <div key={p.slug} role="listitem">
                  <Row post={p} i={n++} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
