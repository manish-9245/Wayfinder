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
  async rewrites() {
    // Single /api/* namespace: page routes (/policies, /metrics, …) always win
    // over rewrites, so proxying bare paths would serve HTML to fetch().
    return [{ source: "/api/:path*", destination: `${GATE}/:path*` }];
  },
};

export default nextConfig;
