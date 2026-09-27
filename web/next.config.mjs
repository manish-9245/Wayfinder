const GATE =
  process.env.WAYFINDER_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://wayfinder-backend.buildwithmanish.com"
    : "http://127.0.0.1:8000");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async redirects() {
    // Renamed setup guides (content now covers using the API and the local
    // repo — no app-deployment walkthroughs). Keep old URLs working.
    return [
      { source: "/blog/deploy-railway", destination: "/blog/use-in-your-project", permanent: true },
      { source: "/blog/self-host-docker", destination: "/blog/run-github-repo-locally", permanent: true },
      { source: "/blog/local-dev-mcp", destination: "/blog/run-github-repo-locally", permanent: true },
    ];
  },
  async rewrites() {
    // Single /api/* namespace: page routes (/policies, /metrics, …) always win
    // over rewrites, so proxying bare paths would serve HTML to fetch().
    return [{ source: "/api/:path*", destination: `${GATE}/:path*` }];
  },
};

export default nextConfig;
