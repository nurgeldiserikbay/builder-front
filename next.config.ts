import type { NextConfig } from "next";

// "standalone" produces a minimal server bundle for the Docker image (see Dockerfile).
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // The service worker must be re-checked on every visit, or phones would keep an old one.
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] }];
  },
};

export default nextConfig;
