import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

function decodeUrlText(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function gtmPathname(url: URL): string {
  return decodeUrlText(url.pathname).replace(/\/{2,}/g, "/");
}

function isGtmHost(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, "");
  return (
    name === "www.googletagmanager.com" ||
    name === "googletagmanager.com" ||
    name.endsWith(".googletagmanager.com")
  );
}

function isGtagJsPath(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!isGtmHost(parsed.hostname)) return false;
    const gtmPath = gtmPathname(parsed);
    return gtmPath === "/gtag/js" || gtmPath.startsWith("/gtag/js/");
  } catch {
    return false;
  }
}

/** Our tag only: query is exactly id=<G-ID>, optionally plus l=. */
function isAllowedGtagScript(url: string): boolean {
  if (!isGtagJsPath(url)) return false;
  try {
    const parsed = new URL(url);
    const keys = [...parsed.searchParams.keys()];
    if (keys.some((key) => key !== "id" && key !== "l")) return false;
    return (
      parsed.searchParams.getAll("id").length === 1 &&
      parsed.searchParams.get("id") === ID
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
    if (isAllowedGtagScript(url)) {
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

function isGtmDiagnostics(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (
      host !== "www.googletagmanager.com" &&
      host !== "googletagmanager.com" &&
      !host.endsWith(".googletagmanager.com")
    ) {
      return false;
    }
    const pathname = parsed.pathname.replace(/\/{2,}/g, "/");
    return (
      pathname === "/td" ||
      pathname.startsWith("/td/") ||
      pathname === "/a" ||
      pathname.startsWith("/a/")
    );
  } catch {
    return false;
  }
}

function rawPathLeak(url: string): boolean {
  const text = decodeUrlText(url);
  return (
    /\/r\/(?!:code)[^/?#]+/.test(text) ||
    /\/profile\/(?!:id)[^/?#]+/.test(text)
  );
}

async function bundleGa4Harness(): Promise<string> {
  const stubDir = mkdtempSync(path.join(tmpdir(), "ga4-harness-"));
  writeFileSync(
    path.join(stubDir, "env-config.ts"),
    `export const envConfig = { ga4MeasurementId: ${JSON.stringify(ID)} };\n`,
  );
  writeFileSync(
    path.join(stubDir, "ads.ts"),
    "export function loadAds(_path?: string): void {}\n",
  );
  writeFileSync(
    path.join(stubDir, "consent.ts"),
    `export function isGa4MeasurementId(value: string): boolean {
  return /^G-[A-Z0-9]+$/.test(value);
}
export function analyticsLoadAllowed(): boolean { return true; }
export function noteKidsFlowVisit(): boolean { return false; }
let record: { analytics: boolean; doNotSellOrShare: boolean } = {
  analytics: true,
  doNotSellOrShare: false,
};
export function readConsentRecord(): { analytics: boolean; doNotSellOrShare: boolean } {
  return record;
}
type Hooks = { beforeCookieDelete?: () => void; onReaccept?: () => void };
let hooks: Hooks = {};
export function setGaWithdrawalHooks(next: Hooks): void {
  hooks = next;
}
function withdraw(): void {
  record = { analytics: false, doNotSellOrShare: true };
  hooks.beforeCookieDelete?.();
}
if (typeof window !== "undefined") {
  (window as Window & { __ptGaWithdraw?: () => void }).__ptGaWithdraw = withdraw;
}
`,
  );
  const repo = path.resolve(".");
  const viteEntry = pathToFileURL(
    path.resolve("frontend/node_modules/vite/dist/node/index.js"),
  ).href;
  const vite = (await import(viteEntry)) as {
    build: (options: Record<string, unknown>) => Promise<unknown>;
  };
  const outDir = path.join(stubDir, "dist");
  await vite.build({
    configFile: false,
    root: stubDir,
    logLevel: "silent",
    define: { __PLATFORM__: JSON.stringify("web") },
    plugins: [
      {
        name: "ga4-harness-stubs",
        enforce: "pre" as const,
        resolveId(source: string) {
          if (source === "virtual:env-config") {
            return path.join(stubDir, "env-config.ts");
          }
          if (source.includes("excluded-paths")) {
            return path.join(stubDir, "ads.ts");
          }
          if (
            source === "./consent" ||
            source.endsWith("/analytics/consent") ||
            source.endsWith("/analytics/consent.ts")
          ) {
            return path.join(stubDir, "consent.ts");
          }
          return undefined;
        },
      },
    ],
    resolve: {
      alias: {
        "virtual:env-config": path.join(stubDir, "env-config.ts"),
      },
    },
    build: {
      lib: {
        entry: path.resolve(repo, "frontend/src/ts/analytics/ga4.ts"),
        name: "PtGa4",
        formats: ["iife"],
        fileName: () => "harness.js",
      },
      outDir,
      emptyOutDir: true,
      write: true,
      minify: false,
    },
  });
  return readFileSync(path.join(outDir, "harness.js"), "utf8");
}

async function serveHarness(
  harness: string,
  startPath: string,
): Promise<{ url: string; close: () => void }> {
  const html = `<!doctype html><title>harness</title><script src="/harness.js"></script><script>window.PtGa4.loadGa4(${JSON.stringify(ID)});</script>`;
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/harness.js")) {
      res.setHeader("content-type", "application/javascript; charset=utf-8");
      res.end(harness);
      return;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(html);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("harness server did not bind");
  }
  return {
    url: `http://127.0.0.1:${address.port}${startPath}`,
    close: () => server.close(),
  };
}

test("forced sampling does not send /td or /a or raw room and profile paths", async ({
  page,
}) => {
  const harness = await bundleGa4Harness();
  const googleUrls: string[] = [];
  const isTdUrls: string[] = [];
  let servedFixture = false;
  await page.addInitScript(() => {
    Math.random = () => 0.99999;
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (isAllowedGtagScript(url)) {
      servedFixture = true;
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: readFileSync(path.resolve(FIXTURES[0].file)),
      });
      return;
    }
    if (isGtagJsPath(url)) {
      isTdUrls.push(url);
      googleUrls.push(url);
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "",
      });
      return;
    }
    if (isGoogle(url)) {
      googleUrls.push(url);
      const body = route.request().postData();
      if (body !== null && body !== undefined && body !== "") {
        googleUrls.push(body);
      }
      await route.fulfill({
        status: 204,
        headers: { "access-control-allow-origin": "*" },
        body: "",
      });
      return;
    }
    await route.continue();
  });

  function assertCleanGoogle(label: string): void {
    expect(
      googleUrls.filter((url) => isGtmDiagnostics(url)),
      label,
    ).toEqual([]);
    expect(isTdUrls, label).toEqual([]);
    for (const url of googleUrls) {
      expect(rawPathLeak(url), label).toBe(false);
    }
  }

  for (const startPath of ["/r/ABCD?x=1#h", "/profile/x?utm_source=qa"]) {
    googleUrls.length = 0;
    isTdUrls.length = 0;
    servedFixture = false;
    const served = await serveHarness(harness, startPath);
    try {
      await page.goto(served.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(7000);
      expect(servedFixture, startPath).toBe(true);
      assertCleanGoogle(startPath);

      const beforeWithdraw = googleUrls.length;
      await page.evaluate(() => {
        (
          window as unknown as { __ptGaWithdraw?: () => void }
        ).__ptGaWithdraw?.();
      });
      await page.evaluate(() => {
        history.pushState({}, "", "/r/ABCD?after=withdraw");
        (
          window as unknown as { PtGa4: { onSpaRouteChange: () => void } }
        ).PtGa4.onSpaRouteChange();
      });
      await page.waitForTimeout(6000);
      expect(googleUrls.length, `withdraw ${startPath}`).toBe(beforeWithdraw);
      assertCleanGoogle(`withdraw ${startPath}`);
    } finally {
      served.close();
    }
  }
});

test("em-on history fixture sends one page_view on Back and Forward", async ({
  page,
}) => {
  const harness = await bundleGa4Harness();
  const fixture = FIXTURES[0];
  expect(fixture.emPageView).toBe(true);
  const bytes = readFileSync(path.resolve(fixture.file));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(fixture.sha256);
  const hits: Hit[] = [];
  let servedFixture = false;
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (isAllowedGtagScript(url)) {
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

  const served = await serveHarness(harness, "/login");
  try {
    await page.goto(served.url, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      (window as unknown as { __ptPopCount?: number }).__ptPopCount = 0;
      window.addEventListener("popstate", () => {
        const state = window as unknown as { __ptPopCount?: number };
        state.__ptPopCount = (state.__ptPopCount ?? 0) + 1;
      });
    });
    await page.waitForTimeout(7000);
    expect(servedFixture).toBe(true);
    expect(hits.filter((hit) => hit.en === "page_view")).toHaveLength(1);

    await page.evaluate(() => {
      history.pushState({}, "", "/settings");
      (
        window as unknown as { PtGa4: { onSpaRouteChange: () => void } }
      ).PtGa4.onSpaRouteChange();
    });
    await page.waitForTimeout(6000);
    expect(hits.filter((hit) => hit.en === "page_view")).toHaveLength(2);

    await page.evaluate(() => {
      history.pushState({}, "", "/about");
      (
        window as unknown as { PtGa4: { onSpaRouteChange: () => void } }
      ).PtGa4.onSpaRouteChange();
    });
    await page.waitForTimeout(6000);
    expect(hits.filter((hit) => hit.en === "page_view")).toHaveLength(3);

    const beforeBack = hits.filter((hit) => hit.en === "page_view").length;
    await page.goBack();
    await page.evaluate(() => {
      (
        window as unknown as { PtGa4: { onSpaRouteChange: () => void } }
      ).PtGa4.onSpaRouteChange();
    });
    await page.waitForTimeout(6000);
    const afterBack = hits.filter((hit) => hit.en === "page_view");
    expect(afterBack).toHaveLength(beforeBack + 1);
    expect(new URL(afterBack.at(-1)?.dl ?? "").pathname).toBe("/settings");
    expect(
      await page.evaluate(
        () => (window as unknown as { __ptPopCount?: number }).__ptPopCount,
      ),
    ).toBe(1);

    const beforeForward = afterBack.length;
    await page.goForward();
    await page.evaluate(() => {
      (
        window as unknown as { PtGa4: { onSpaRouteChange: () => void } }
      ).PtGa4.onSpaRouteChange();
    });
    await page.waitForTimeout(6000);
    const afterForward = hits.filter((hit) => hit.en === "page_view");
    expect(afterForward).toHaveLength(beforeForward + 1);
    expect(new URL(afterForward.at(-1)?.dl ?? "").pathname).toBe("/about");
    expect(
      await page.evaluate(
        () => (window as unknown as { __ptPopCount?: number }).__ptPopCount,
      ),
    ).toBe(2);

    for (const hit of hits.filter((row) => row.en === "page_view")) {
      expect(hit.gcs, hit.dl).toBe("G101");
      expect(hit.npa, hit.dl).toBe("1");
    }
  } finally {
    served.close();
  }
});
