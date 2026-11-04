import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next", // a production build can sit beside the running dev server
  serverExternalPackages: ["pg"],
  // Keep pages you visited for 3 min, so going back or switching tabs is instant. Every edit calls router.refresh(),
  // which drops the cache, so changes still show at once.
  experimental: { staleTimes: { dynamic: 180 } },
};

export default nextConfig;
