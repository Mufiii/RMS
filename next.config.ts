import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Lean self-contained build for the shop PC / VPS (docs/04-deployment.md).
  output: "standalone",
  // Lets the E2E server run alongside `npm run dev` without sharing a build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Cache Components is intentionally OFF: every screen is per-user and must
  // show live stock and money, so plain request-time rendering is the safer model.
  // See docs/02-architecture.md §2.
  // Dev only: let phones/PCs on the shop LAN use live reload (http://192.168.x.x:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  serverExternalPackages: ["@prisma/client", "pg", "bcryptjs", "playwright", "playwright-core"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
