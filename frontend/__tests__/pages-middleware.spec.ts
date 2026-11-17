import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";
import {
  onRequest,
  isAssetPath,
  ASSET_PREFIXES,
  normalizePath,
} from "../../functions/_middleware";
import { TEACHING_KIDS_GUIDE_PATH } from "../src/ts/controllers/background-music";
import {
  KIDS_CANONICAL_PATH,
  KIDS_CSP_PATHS,
} from "../vite-plugins/kids-csp-paths";
import routes from "../static/_routes.json";

const html = (): Response =>
  new Response("<!doctype html><html></html>", {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
const js = (): Response =>
  new Response("export{}", {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });

const run = async (
  path: string,
  next: () => Response,
  host = "puggietype.com",
): Promise<Response> =>
  onRequest({
    request: new Request(`https://${host}${path}`, {
      headers: { Origin: "https://puggietype.com" },
    }),
    next: async () => next(),
  });

describe("pages middleware", () => {
  it("missing /js hash: 404 no-store, not the spa html", async () => {
    const r = await run("/js/puggietype.CR9YH8lL.js", html);
    expect(r.status).toBe(404);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(r.headers.get("Content-Type")).not.toContain("text/html");
    expect(r.headers.get("Strict-Transport-Security")).toContain("max-age");
  });

  it.each(["/css/a.X1.css", "/webfonts/x.woff2", "/assets/y.png"])(
    "missing %s: 404",
    async (p) => {
      expect((await run(p, html)).status).toBe(404);
    },
  );

  it("real asset passes through with immutable caching", async () => {
    const r = await run("/js/puggietype.D8snpXos.js", js);
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toContain("immutable");
    expect(await r.text()).toBe("export{}");
  });

  it("upstream 404 on an asset becomes no-store", async () => {
    const r = await run("/js/x.js", () => new Response("", { status: 404 }));
    expect(r.status).toBe(404);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("spa routes still get the html fallback", async () => {
    for (const p of ["/", "/race", "/r/ABCD", "/jsfoo"]) {
      const r = await run(p, html);
      expect(r.status).toBe(200);
      expect(r.headers.get("Content-Type")).toContain("text/html");
    }
  });

  it("www still 301s to apex", async () => {
    const r = await run("/js/a.js", html, "www.puggietype.com");
    expect(r.status).toBe(301);
    expect(r.headers.get("Location")).toBe("https://puggietype.com/js/a.js");
  });

  it("isAssetPath", () => {
    expect(isAssetPath("/js/a.js")).toBe(true);
    expect(isAssetPath("/jsx")).toBe(false);
    expect(isAssetPath("/race")).toBe(false);
  });

  it("_routes.json keeps every asset prefix out of Functions", () => {
    for (const p of ASSET_PREFIXES) {
      expect(routes.exclude).toContain(`${p}*`);
    }
  });

  it("isAssetPath is case-insensitive and covers /images", () => {
    expect(isAssetPath("/JS/a.js")).toBe(true);
    expect(isAssetPath("/Css/a.css")).toBe(true);
    expect(isAssetPath("/images/x.png")).toBe(true);
    expect(isAssetPath("/imagesx")).toBe(false);
  });

  const req = async (
    path: string,
    init: RequestInit = {},
    next: () => Response = html,
  ): Promise<Response> =>
    onRequest({
      request: new Request(`https://puggietype.com${path}`, init),
      next: async () => next(),
    });

  it.each([
    ["HEAD", { method: "HEAD" }],
    ["no Origin", {}],
    ["Origin", { headers: { Origin: "https://puggietype.com" } }],
    [
      "cors",
      { headers: { Origin: "https://x.example", "Sec-Fetch-Mode": "cors" } },
    ],
  ])("missing asset, %s: 404 no-store", async (_n, init) => {
    const r = await req("/js/puggietype.Zz9.js", init);
    expect(r.status).toBe(404);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("missing asset with a query string: 404 no-store", async () => {
    const r = await req("/css/a.X1.css?v=2");
    expect(r.status).toBe(404);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not set or clear pt_country on html", async () => {
    for (const path of ["/", "/privacy", "/faq", "/race"]) {
      const request = new Request(`https://puggietype.com${path}`, {
        headers: { Cookie: "pt_country=US" },
      });
      Object.assign(request, { cf: { country: "DE" } });
      const r = await onRequest({
        request,
        next: async () => html(),
      });
      const setCookie = r.headers.get("set-cookie");
      expect(setCookie).toBeNull();
      expect(setCookie ?? "").not.toMatch(/pt_country|Max-Age=0/i);
    }
  });

  it("real asset with a query string and Origin passes through", async () => {
    const r = await req(
      "/js/a.js?x=1",
      { headers: { Origin: "https://puggietype.com" } },
      js,
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toContain("immutable");
  });
});

describe("kids guide canonical redirect", () => {
  const CANONICAL = "https://puggietype.com/guide/teaching-kids-to-type";

  const get = async (
    path: string,
    host = "puggietype.com",
  ): Promise<{ res: Response; nextCalls: number }> => {
    let nextCalls = 0;
    const res = await onRequest({
      request: new Request(`https://${host}${path}`),
      next: async () => {
        nextCalls++;
        return html();
      },
    });
    return { res, nextCalls };
  };

  it("canonical path is the parents guide", () => {
    expect(KIDS_CANONICAL_PATH).toBe(TEACHING_KIDS_GUIDE_PATH);
    expect(KIDS_CSP_PATHS).toContain(KIDS_CANONICAL_PATH);
  });

  it.each([
    "/guide/teaching-kids-to-type",
    "/guide/teaching-kids-to-type?utm_source=x",
    // exact trailing-slash and old-slug paths: left to static/_redirects
    "/guide/teaching-kids-to-type/",
    "/guide/typing-for-kids",
    "/guide/typing-for-kids/",
  ])("%s passes through untouched", async (p) => {
    const { res, nextCalls } = await get(p);
    expect(res.status).toBe(200);
    expect(res.headers.get("Location")).toBeNull();
    expect(nextCalls).toBe(1);
  });

  it.each([
    "/guide//teaching-kids-to-type",
    "//guide/teaching-kids-to-type",
    "/guide///teaching-kids-to-type",
    "/guide/teaching-kids-to-typ%65",
    "/guide/%74eaching-kids-to-type",
    "/%67uide/teaching-kids-to-type",
    "/guide/teaching%2Dkids%2dto%2Dtype",
    "/guide//teaching-kids-to-typ%65",
    "/guide//teaching-kids-to-type/",
    "/guide/teaching-kids-to-typ%65/",
    "/guide//typing-for-kids",
    "/guide/typing-for-kid%73",
    "/guide/typing-for-kid%73/",
  ])("%s 301s to the canonical kids guide", async (p) => {
    const { res, nextCalls } = await get(p);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe(CANONICAL);
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age");
    expect(nextCalls).toBe(0);
  });

  it("keeps the query string", async () => {
    const { res } = await get("/guide//teaching-kids-to-type?a=1&b=%2F");
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe(`${CANONICAL}?a=1&b=%2F`);
  });

  it("does not loop: the redirect target passes through", async () => {
    const { res } = await get("/guide/teaching-kids-to-typ%65?x=1");
    const target = new URL(res.headers.get("Location") ?? "");
    const second = await get(`${target.pathname}${target.search}`);
    expect(second.res.status).toBe(200);
    expect(second.nextCalls).toBe(1);
  });

  it("www still goes to apex first, keeping the path", async () => {
    const { res } = await get(
      "/guide//teaching-kids-to-type",
      "www.puggietype.com",
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe(
      "https://puggietype.com/guide//teaching-kids-to-type",
    );
  });

  it.each([
    "/guide%2Fteaching-kids-to-type",
    "/guide%2fteaching-kids-to-type",
    "/guide%2Ftyping-for-kids",
    "/guide/teaching-kids-to-type%2F",
    "/guide%2F%2Fteaching-kids-to-typ%65",
  ])(
    "%s: %2F is not decoded into a redirect; 404 instead of the kids page",
    async (p) => {
      const { res, nextCalls } = await get(p);
      expect(res.status).toBe(404);
      expect(res.headers.get("Location")).toBeNull();
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(nextCalls).toBe(0);
    },
  );

  it.each([
    "/guide/teaching-kids-to-type%E0%A4%A",
    "/guide/teaching-kids-to-typ%6",
    "/guide/teaching-kids-to-typ%",
    "/guide/teaching-kids-to-typ%ZZ",
    "/guide/%E0%A4%A/teaching-kids-to-type",
  ])("malformed encoding %s falls through", async (p) => {
    const { res, nextCalls } = await get(p);
    expect(res.status).toBe(200);
    expect(res.headers.get("Location")).toBeNull();
    expect(nextCalls).toBe(1);
  });

  it.each([
    "/",
    "/privacy",
    "/guide/",
    "/guide//typing-tips",
    "/guide/typing-tip%73",
    "/guide/teaching-kids-to-type-more",
    "/guide/teaching-kids-to-type/extra",
    "/GUIDE/teaching-kids-to-type",
    "/r//ABCD",
    "/profile/a%2Fb",
  ])("non-kids path %s is untouched", async (p) => {
    const { res, nextCalls } = await get(p);
    expect(res.status).toBe(200);
    expect(res.headers.get("Location")).toBeNull();
    expect(nextCalls).toBe(1);
  });

  it("normalizePath decodes only unreserved escapes and collapses slashes", () => {
    expect(normalizePath("/a//b%7E%2e%5F%2D%41z")).toBe("/a/b~._-Az");
    expect(normalizePath("/a%2Fb%2fc%20d%3F")).toBe("/a%2Fb%2fc%20d%3F");
    expect(normalizePath("/%E0%A4%A")).toBe("/%E0%A4%A");
    expect(normalizePath("/%256")).toBe("/%256");
  });

  it("static/_redirects 301s every other kids path to the canonical one", () => {
    const redirects = readFileSync(
      path.resolve(__dirname, "../static/_redirects"),
      "utf8",
    );
    const lines = redirects.split("\n").map((line) => line.trim());
    for (const p of KIDS_CSP_PATHS) {
      if (p === KIDS_CANONICAL_PATH) continue;
      expect(lines).toContain(`${p} ${KIDS_CANONICAL_PATH} 301`);
    }
  });
});
