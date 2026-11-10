import type { NextConfig } from "next";

// "standalone" produces a minimal server bundle for the Docker image (see Dockerfile).
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
