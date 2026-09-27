import type { MetadataRoute } from "next";
import { listPosts } from "@/lib/blog";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

const ROUTES = ["", "/console", "/batch", "/policies", "/docs", "/metrics", "/legal", "/blog"];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ROUTES.map((r) => ({
    url: `${SITE_URL}${r || "/"}`,
    lastModified: new Date(),
    changeFrequency: (r === "" ? "weekly" : "monthly") as "weekly" | "monthly",
    priority: r === "" || r === "/blog" ? 1 : 0.7,
  }));
  const posts = listPosts().map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));
  return [...staticRoutes, ...posts];
}
