import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { steamAssetClearance } from "../../vite-plugins/steam-asset-clearance";

const src = (p: string): string =>
  readFileSync(path.resolve(__dirname, "../../src/ts", p), "utf8");

function runCloseBundle(platform: "web" | "steam", outDir: string): void {
  const plugin = steamAssetClearance({ platform }) as {
    configResolved: (c: unknown) => void;
    closeBundle: () => void;
  };
  plugin.configResolved({ root: "/", build: { outDir } });
  plugin.closeBundle();
}

describe("steam game settings stay out of the web build", () => {
  it("the web build drops static/music; the steam build keeps it", () => {
    for (const platform of ["web", "steam"] as const) {
      const out = mkdtempSync(path.join(tmpdir(), "pt-music-"));
      mkdirSync(path.join(out, "music"));
      writeFileSync(path.join(out, "music", "a.ogg"), "x");
      runCloseBundle(platform, out);
      expect(existsSync(path.join(out, "music")), platform).toBe(
        platform === "steam",
      );
    }
  });

  it("steam modules are only reachable behind inline __PLATFORM__ checks", () => {
    const guard =
      'typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "steam"';
    const registry = src("components/pages/page-registry.ts");
    expect(registry).toContain(
      `${guard}\n      ? import("./settings/SteamSettingsPage")\n      : import("./settings/SettingsPage")`,
    );
    const index = src("index.tsx");
    expect(index).toContain(
      `if (${guard}) {\n  void import("./steam/game-settings")`,
    );
    // nothing else imports the steam modules statically
    expect(index).not.toMatch(/^import .*steam\//m);
    expect(registry).not.toMatch(/^import .*Steam/m);
  });
});
