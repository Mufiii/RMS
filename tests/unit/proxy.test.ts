import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

// The matcher is a path-to-regexp pattern whose group is a plain JS regex.
const matches = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

describe("proxy matcher", () => {
  it.each(["/", "/users", "/customers/12", "/change-password", "/audit?before=5"])("guards %s", (p) => {
    expect(matches(p.split("?")[0])).toBe(true);
  });

  // Regression: redirecting the dev live-reload connection to /login made the
  // signed-out login page reload endlessly (2026-11-06).
  it.each([
    "/login",
    "/forbidden",
    "/api/health",
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/_next/webpack-hmr",
    "/_next/turbopack-hmr",
    "/favicon.ico",
  ])("lets %s through", (p) => {
    expect(matches(p)).toBe(false);
  });
});
