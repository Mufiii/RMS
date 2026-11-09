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
  // A Content-Security-Policy is deliberately left out: Next's App Router can
  // stream hydration data as an inline <script>, which a strict script-src
  // would break; adding one needs the framework's nonce-based CSP wiring,
  // verified end to end, not a guess here (docs/02-architecture.md §5).
  async headers() {
    const headers = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
    ];
    // HTTPS only (VPS option); the shop PC serves plain HTTP (docs/04-deployment.md).
    if (process.env.COOKIE_SECURE === "true") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default withNextIntl(nextConfig);
