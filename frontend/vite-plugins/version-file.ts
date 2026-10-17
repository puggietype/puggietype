import { Plugin } from "vite";
import path from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
export function versionFile(options: { clientVersion: string }): Plugin {
  // the resolved build.outDir, so `vite build --outDir x` doesn't write into
  // ./dist (served by a running preview)
  let outDir = path.resolve("./dist");
  return {
    name: "generate-version-json",
    apply: "build",

    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },

    closeBundle() {
      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
      }

      const versionJson = JSON.stringify({ version: options.clientVersion });
      const versionPath = path.resolve(outDir, "version.json");
      writeFileSync(versionPath, versionJson);
    },
  };
}
