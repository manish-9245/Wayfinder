import fs from "node:fs";
import path from "node:path";

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  tag: string;
  blurb: string;
  minutes: number;
  section: "Use cases" | "Setup guides";
}

export interface Post extends PostMeta {
  body: string;
}

const DIR = path.join(process.cwd(), "content", "blog");

function parse(file: string, slug: string): Post {
  const raw = fs.readFileSync(path.join(DIR, file), "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`blog/${slug}: missing frontmatter`);
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  if (!meta.title || !meta.date || !meta.tag || !meta.blurb) {
    throw new Error(`blog/${slug}: frontmatter needs title, date, tag, blurb`);
  }
  return {
    slug,
    title: meta.title,
    date: meta.date,
    tag: meta.tag,
    blurb: meta.blurb,
    minutes: Number(meta.minutes || 7),
    section: meta.section === "Setup guides" ? "Setup guides" : "Use cases",
    body: m[2].trim() + "\n",
  };
}

export function listPosts(): PostMeta[] {
  const posts = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parse(f, f.replace(/\.md$/, "")));
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  return posts.map(({ body: _b, ...meta }) => meta);
}

export function getPost(slug: string): Post | null {
  const file = path.join(DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  return parse(`${slug}.md`, slug);
}
