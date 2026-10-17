import childProcess from "node:child_process";
import { describe, it, expect } from "vitest";

import {
  getCommitHash,
  getSourceLinks,
  gitArchive,
  parseSourceUrlMode,
  shouldSkipTarball,
  tarballName,
} from "../../vite-plugins/source-links";

const hash = "0123456789abcdef0123456789abcdef01234567";

describe("source-links", () => {
  it("defaults SOURCE_URL_MODE to github", () => {
    expect(parseSourceUrlMode(undefined)).toBe("github");
    expect(parseSourceUrlMode("")).toBe("github");
    expect(parseSourceUrlMode("tarball")).toBe("tarball");
    expect(parseSourceUrlMode("github")).toBe("github");
  });

  it("names the tarball after the short hash", () => {
    expect(tarballName(hash)).toBe("puggietype-0123456.tar.gz");
  });

  it("tarball mode links the self-hosted tarball and license", () => {
    expect(getSourceLinks({ commitHash: hash, mode: "tarball" })).toEqual({
      commitHash: hash,
      sourceUrl: "/source/puggietype-0123456.tar.gz",
      licenseUrl: "/source/LICENSE.txt",
      tarballName: "puggietype-0123456.tar.gz",
    });
  });

  it("github mode links the tree and LICENSE at the commit", () => {
    expect(getSourceLinks({ commitHash: hash, mode: "github" })).toEqual({
      commitHash: hash,
      sourceUrl: `https://github.com/puggietype/puggietype/tree/${hash}`,
      licenseUrl: `https://github.com/puggietype/puggietype/blob/${hash}/LICENSE`,
      tarballName: "puggietype-0123456.tar.gz",
    });
  });

  it("skips the tarball on Cloudflare Pages or SOURCE_TARBALL=0", () => {
    expect(shouldSkipTarball({ CF_PAGES: "1" })).toBe(true);
    expect(shouldSkipTarball({ SOURCE_TARBALL: "0" })).toBe(true);
    expect(shouldSkipTarball({})).toBe(false);
    const links = getSourceLinks({
      commitHash: hash,
      mode: "tarball",
      skipTarball: true,
    });
    expect(links.sourceUrl).toBe(
      `https://github.com/puggietype/puggietype/tree/${hash}`,
    );
    expect(links.tarballName).toBeUndefined();
  });

  it("prefers CF_PAGES_COMMIT_SHA, else main on Pages", () => {
    expect(getCommitHash({ CF_PAGES: "1", CF_PAGES_COMMIT_SHA: hash })).toBe(
      hash,
    );
    expect(getCommitHash({ CF_PAGES: "1" })).toBeUndefined();
  });

  it("falls back to main without a commit hash", () => {
    for (const mode of ["tarball", "github"] as const) {
      const links = getSourceLinks({ commitHash: undefined, mode });
      expect(links.sourceUrl).toBe(
        "https://github.com/puggietype/puggietype/tree/main",
      );
      expect(links.licenseUrl).toBe(
        "https://github.com/puggietype/puggietype/blob/main/LICENSE",
      );
      expect(links.tarballName).toBeUndefined();
    }
  });

  it("archives the whole repo, including LICENSE and NOTICE", () => {
    const commitHash = getCommitHash();
    expect(commitHash).toMatch(/^[0-9a-f]{40}$/);
    if (commitHash === undefined) return;
    const files = childProcess
      .execFileSync("tar", ["-tz"], {
        input: gitArchive(commitHash),
        maxBuffer: 64 * 1024 * 1024,
      })
      .toString()
      .split("\n");
    const prefix = `puggietype-${commitHash.slice(0, 7)}/`;
    expect(files).toContain(`${prefix}LICENSE`);
    expect(files).toContain(`${prefix}NOTICE`);
    expect(files).toContain(`${prefix}frontend/vite.config.ts`);
  }, 60_000);
});
