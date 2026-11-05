import { describe, it, expect } from "vitest";
import {
  onRequest,
  isAssetPath,
  ASSET_PREFIXES,
  COUNTRY_COOKIE,
  countrySetCookie,
  normalizeEdgeCountry,
} from "../../functions/_middleware";
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

  it("sets pt_country on html from the edge country", async () => {
    const request = new Request("https://puggietype.com/privacy");
    Object.assign(request, { cf: { country: "de" } });
    const r = await onRequest({
      request,
      next: async () => html(),
    });
    expect(r.headers.get("set-cookie")).toBe(countrySetCookie("DE"));
    expect(normalizeEdgeCountry("uk")).toBe("GB");
    expect(normalizeEdgeCountry("XX")).toBeNull();
    expect(normalizeEdgeCountry("T1")).toBeNull();
  });

  it("does not set a country cookie on assets or when the country is unknown", async () => {
    const asset = new Request("https://puggietype.com/js/a.js");
    Object.assign(asset, { cf: { country: "US" } });
    const assetRes = await onRequest({
      request: asset,
      next: async () => js(),
    });
    expect(assetRes.headers.get("set-cookie")).toBeNull();

    const page = new Request("https://puggietype.com/faq");
    Object.assign(page, { cf: { country: "XX" } });
    const pageRes = await onRequest({
      request: page,
      next: async () => html(),
    });
    expect(pageRes.headers.get("set-cookie")).toBeNull();
    expect(COUNTRY_COOKIE).toBe("pt_country");
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
