import { execSync } from "node:child_process";
import type { NextConfig } from "next";

// When the code this copy runs was last changed (its newest commit), for "A new version of broke is ready".
let builtFrom = "";
try {
  builtFrom = execSync("git log -1 --format=%cI", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  /* no git (a download without history): the update check stays quiet */
}

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next", // a production build can sit beside the running dev server
  serverExternalPackages: ["pg"],
  env: { BROKE_BUILT_FROM: builtFrom },
  // Keep pages you visited for 3 min, so going back or switching tabs is instant. Every edit calls router.refresh(),
  // which drops the cache, so changes still show at once.
  experimental: { staleTimes: { dynamic: 180 } },
};

export default nextConfig;
