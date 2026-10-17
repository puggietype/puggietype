import { Plugin, ResolvedConfig } from "vite";
import path from "node:path";
import childProcess from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";

export const REPO_URL = "https://github.com/puggietype/puggietype";
export const UPSTREAM_URL = "https://github.com/monkeytypegame/monkeytype";
// cloudflare pages rejects files bigger than this
const MAX_DEPLOY_FILE_BYTES = 25 * 1024 * 1024;

export type SourceUrlMode = "tarball" | "github";

export type SourceLinks = {
  commitHash: string | undefined;
  sourceUrl: string;
  licenseUrl: string;
  tarballName: string | undefined;
};

export function parseSourceUrlMode(value: string | undefined): SourceUrlMode {
  return value === "github" ? "github" : "tarball";
}

export function tarballName(commitHash: string): string {
  return `puggietype-${commitHash.slice(0, 7)}.tar.gz`;
}

export function getSourceLinks(options: {
  commitHash: string | undefined;
  mode: SourceUrlMode;
}): SourceLinks {
  const { commitHash, mode } = options;
  if (commitHash === undefined) {
    return {
      commitHash,
      sourceUrl: `${REPO_URL}/tree/main`,
      licenseUrl: `${REPO_URL}/blob/main/LICENSE`,
      tarballName: undefined,
    };
  }
  if (mode === "github") {
    return {
      commitHash,
      sourceUrl: `${REPO_URL}/tree/${commitHash}`,
      licenseUrl: `${REPO_URL}/blob/${commitHash}/LICENSE`,
      tarballName: undefined,
    };
  }
  const name = tarballName(commitHash);
  return {
    commitHash,
    sourceUrl: `/source/${name}`,
    licenseUrl: `/source/LICENSE.txt`,
    tarballName: name,
  };
}

export function getCommitHash(): string | undefined {
  try {
    return childProcess
      .execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

function repoRoot(): string {
  return childProcess
    .execFileSync("git", ["rev-parse", "--show-toplevel"])
    .toString()
    .trim();
}

export function gitArchive(commitHash: string): Buffer {
  const prefix = `puggietype-${commitHash.slice(0, 7)}/`;
  // run from the repo root: from a subdirectory git archives only that subtree
  return childProcess.execFileSync(
    "git",
    ["archive", "--format=tar.gz", `--prefix=${prefix}`, commitHash],
    { cwd: repoRoot(), maxBuffer: 1024 * 1024 * 1024 },
  );
}

function gitLicense(commitHash: string): Buffer {
  return childProcess.execFileSync("git", ["show", `${commitHash}:LICENSE`]);
}

/**
 * Writes /source/<tarball> (git archive of the built commit) and
 * /source/LICENSE.txt into the build output, and serves both in dev.
 */
export function sourceTarball(links: SourceLinks): Plugin {
  let config: ResolvedConfig;
  return {
    name: "source-tarball",
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      const { commitHash, tarballName: name } = links;
      if (commitHash === undefined || name === undefined) return;
      server.middlewares.use((req, res, next) => {
        if (req.url === `/source/${name}`) {
          res.setHeader("Content-Type", "application/gzip");
          res.end(gitArchive(commitHash));
          return;
        }
        if (req.url === "/source/LICENSE.txt") {
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(gitLicense(commitHash));
          return;
        }
        next();
      });
    },
    closeBundle() {
      const { commitHash, tarballName: name } = links;
      if (config.command !== "build") return;
      if (commitHash === undefined || name === undefined) return;
      const dir = path.resolve(config.root, config.build.outDir, "source");
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, name);
      writeFileSync(file, gitArchive(commitHash));
      writeFileSync(path.join(dir, "LICENSE.txt"), gitLicense(commitHash));
      const size = statSync(file).size;
      if (size > MAX_DEPLOY_FILE_BYTES) {
        config.logger.warn(
          `[source-tarball] ${name} is ${(size / 1024 / 1024).toFixed(1)} MiB, over the 25 MiB Cloudflare Pages file limit`,
        );
      }
    },
  };
}
