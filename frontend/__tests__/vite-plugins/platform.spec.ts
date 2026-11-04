import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolvePlatform } from "../../vite-plugins/platform";

describe("resolvePlatform", () => {
  it("defaults to web when PLATFORM is unset or empty", () => {
    expect(resolvePlatform({})).toBe("web");
    expect(resolvePlatform({ PLATFORM: "" })).toBe("web");
    expect(resolvePlatform({ PLATFORM: "web" })).toBe("web");
  });

  it("selects steam only for PLATFORM=steam", () => {
    expect(resolvePlatform({ PLATFORM: "steam" })).toBe("steam");
  });

  it("rejects unknown values", () => {
    expect(() => resolvePlatform({ PLATFORM: "xbox" })).toThrow(
      'PLATFORM must be "web" or "steam"',
    );
  });

  it("only reads PLATFORM, not VITE_PLATFORM or other keys", () => {
    expect(resolvePlatform({ VITE_PLATFORM: "steam" })).toBe("web");
  });
});

describe("vite.config PLATFORM source", () => {
  const config = readFileSync(
    path.resolve(__dirname, "../../vite.config.ts"),
    "utf8",
  );

  it("reads PLATFORM from the shell (process.env), not from loadEnv/.env", () => {
    expect(config).toContain("resolvePlatform(process.env)");
    expect(config).not.toMatch(/env\[\s*["']PLATFORM["']\s*\]/);
    expect(config).not.toMatch(/env\.PLATFORM\b/);
  });
});
