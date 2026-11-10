import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Request } from "@playwright/test";

/**
 * Saved GET of https://www.googletagmanager.com/gtag/js?id=G-B8GK1C9T6T.
 * Collects are answered here and are not forwarded.
 */
const FIXTURES = [
  {
    file: "e2e/fixtures/gtag-G-B8GK1C9T6T-em-on.js.bin",
    sha256: "b09bcf0fac8f774f11df5a451be886c1edc60d1e46484b77973d0c8da3b524e7",
    emPageView: true,
  },
  {
    file: "e2e/fixtures/gtag-G-B8GK1C9T6T.js.bin",
    sha256: "91a205abf80be3803f09fa6cb7faf9d2763fbecd9061a410230eb9e695dd8644",
    emPageView: false,
  },
] as const;
const ID = "G-B8GK1C9T6T";

const chromePath = process.env["CHROME_PATH"];
if (chromePath !== undefined && chromePath !== "") {
  test.use({
    launchOptions: { executablePath: chromePath },
  });
}

type Hit = {
  en: string;
  gcs: string;
  npa: string;
  dl: string;
  dr: string;
};

function isGtagScript(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "www.googletagmanager.com" &&
      parsed.pathname.startsWith("/gtag/")
    );
  } catch {
    return false;
  }
}

function isGoogle(url: string): boolean {
  return /google|doubleclick|googlesyndication|googleadservices/.test(url);
}

function hitsFrom(request: Request): Hit[] {
  const url = new URL(request.url());
  const base = Object.fromEntries(url.searchParams);
  const lines = (request.postData() ?? "").split(/\r?\n/).filter(Boolean);
  const rows = lines.length
    ? lines.map((line) => ({
        ...base,
        ...Object.fromEntries(new URLSearchParams(line)),
      }))
    : [base];
  return rows.map((row) => ({
    en: row["en"] ?? "",
    gcs: row["gcs"] ?? "",
    npa: row["npa"] ?? "",
    dl: row["dl"] ?? "",
    dr: row["dr"] ?? "",
  }));
}

async function servePage(): Promise<{ url: string; close: () => void }> {
  const html = `<!doctype html><title>container</title><script>
    const id = ${JSON.stringify(ID)};
    const denied = {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      functionality_storage: "denied",
      personalization_storage: "denied",
      security_storage: "granted"
    };
    window.dataLayer = [];
    function gtag(){ dataLayer.push(arguments); }
    window.gtag = gtag;
    const fields = {
      page_path: location.pathname,
      page_location: location.origin + location.pathname,
      page_referrer: ""
    };
    gtag("consent", "default", denied);
    gtag("consent", "update", Object.assign({}, denied, { analytics_storage: "granted" }));
    gtag("set", "allow_google_signals", false);
    gtag("set", Object.assign({
      send_page_view: false,
      ads_data_redaction: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    }, fields));
    gtag("js", new Date());
    gtag("config", id, Object.assign({
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      ads_data_redaction: true,
      send_page_view: false,
      cookie_expires: 34128000
    }, fields));
    gtag("event", "page_view", Object.assign({ send_to: id }, fields));
    const nativePush = history.pushState.bind(history);
    const nativeReplace = history.replaceState.bind(history);
    function lock(name, fn) {
      Object.defineProperty(history, name, { configurable: false, writable: false, value: fn });
    }
    lock("pushState", function (state, title, url) { return nativePush(state, title, url); });
    lock("replaceState", function (state, title, url) { return nativeReplace(state, title, url); });
    const script = document.createElement("script");
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + id;
    document.head.appendChild(script);
  </script>`;
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(html);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("fixture server did not bind");
  }
  return {
    url: `http://127.0.0.1:${address.port}/login?email=ada@example.com&token=sekret#access_token=FAKE`,
    close: () => server.close(),
  };
}

test("real GA4 container sends one consented page view per route", async ({
  page,
}) => {
  let bytes = Buffer.alloc(0);
  const hits: Hit[] = [];
  let servedFixture = false;
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (isGtagScript(url)) {
      servedFixture = true;
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: bytes,
      });
      return;
    }
    if (isGoogle(url)) {
      hits.push(...hitsFrom(route.request()));
      await route.fulfill({
        status: 204,
        headers: { "access-control-allow-origin": "*" },
        body: "",
      });
      return;
    }
    await route.continue();
  });

  for (const fixture of FIXTURES) {
    bytes = readFileSync(path.resolve(fixture.file));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      fixture.sha256,
    );
    expect(bytes.includes(Buffer.from("__ccd_em_page_view"))).toBe(
      fixture.emPageView,
    );
    hits.length = 0;
    servedFixture = false;
    const served = await servePage();
    try {
      await page.goto(served.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(7000);
      const afterLoad = hits.filter((hit) => hit.en === "page_view").length;
      await page.evaluate(() => {
        history.pushState({}, "", "/next?q=1#hash");
        const fields = {
          page_path: location.pathname,
          page_location: `${location.origin}${location.pathname}`,
          page_referrer: `${location.origin}/login`,
        };
        const gtag = (
          window as Window & { gtag?: (...args: unknown[]) => void }
        ).gtag;
        gtag?.("set", fields);
        gtag?.("event", "page_view", { ...fields, send_to: "G-B8GK1C9T6T" });
      });
      await page.waitForTimeout(6000);
      expect(servedFixture).toBe(true);
      expect(afterLoad).toBe(1);
      const views = hits.filter((hit) => hit.en === "page_view");
      expect(views).toHaveLength(2);
      for (const hit of hits) {
        expect(hit.gcs, hit.en).toBe("G101");
        expect(hit.npa, hit.en).toBe("1");
        expect(hit.dl, hit.en).not.toMatch(/[?#]/);
        expect(hit.dr, hit.en).not.toMatch(/[?#]/);
      }
      expect(views.map((hit) => new URL(hit.dl).pathname)).toEqual([
        "/login",
        "/next",
      ]);
    } finally {
      served.close();
    }
  }
});
