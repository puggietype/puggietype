import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * Pages Functions / _headers failing open: the built kids html is served under
 * the catch-all CSP (GA hosts allowed) or under no CSP at all. Its meta CSP
 * must still block gtag.js and GA collects. Each case has a control with the
 * meta stripped, where the same load goes through. Google is never contacted:
 * those requests are answered by page.route, and only reach it if CSP allows.
 * Needs a GA4_MEASUREMENT_ID=G-QATEST0000 build in frontend/dist (or KIDS_DIST).
 */
const DIST = path.resolve(process.env["KIDS_DIST"] ?? "frontend/dist");
const GTAG_URL = "https://www.googletagmanager.com/gtag/js?id=G-QATEST0000";
const COLLECT_URL =
  "https://www.google-analytics.com/g/collect?v=2&tid=G-QATEST0000&en=page_view";
const META_CSP_RE =
  /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g;
const KIDS_PAGES = ["teaching-kids-to-type", "typing-for-kids"];
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/** the `/*` CSP from the built _headers (first CSP line) */
function mainCsp(): string {
  const headers = readFileSync(path.join(DIST, "_headers"), "utf8");
  const match = /^\s*Content-Security-Policy:\s*(.*)$/m.exec(headers);
  if (match?.[1] === undefined) throw new Error("no CSP in _headers");
  return match[1].trim();
}

function kidsHtml(name: string): string {
  return readFileSync(path.join(DIST, "guide", `${name}.html`), "utf8");
}

let server: Server;
let origin = "";

test.beforeAll(async () => {
  expect(
    mainCsp(),
    "catch-all CSP must allow gtag (build with GA4_MEASUREMENT_ID=G-QATEST0000)",
  ).toContain("https://www.googletagmanager.com");
  // /guide/<kids>?header=main|none&meta=0: kids html under the given header
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const kids = /^\/guide\/([a-z-]+)$/.exec(url.pathname)?.[1];
    if (kids !== undefined && KIDS_PAGES.includes(kids)) {
      let html = kidsHtml(kids);
      if (url.searchParams.get("meta") === "0") {
        html = html.replace(META_CSP_RE, "");
      }
      const headers: Record<string, string> = {
        "content-type": TYPES[".html"] ?? "",
      };
      if (url.searchParams.get("header") === "main") {
        headers["content-security-policy"] = mainCsp();
      }
      res.writeHead(200, headers).end(html);
      return;
    }
    const file = path.join(DIST, path.normalize(url.pathname));
    if (
      !file.startsWith(DIST + path.sep) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      res.writeHead(404).end();
      return;
    }
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type }).end(readFileSync(file));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("no port");
  }
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

type Violation = { directive: string; blocked: string; policy: string };

/** answers Google locally (counting hits), aborts any other off-box request */
async function stubNetwork(
  page: Page,
): Promise<{ google: string[]; other: string[] }> {
  const seen = { google: [] as string[], other: [] as string[] };
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(origin)) {
      await route.continue();
      return;
    }
    if (
      /^https:\/\/www\.(googletagmanager|google-analytics)\.com\//.test(url)
    ) {
      seen.google.push(url);
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: "window.__gtagRan = true;",
      });
      return;
    }
    seen.other.push(url);
    await route.abort();
  });
  await page.addInitScript(() => {
    const list: Violation[] = [];
    Object.assign(window, { __violations: list });
    document.addEventListener("securitypolicyviolation", (event) => {
      list.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
        policy: event.originalPolicy,
      });
    });
  });
  return seen;
}

async function violations(page: Page): Promise<Violation[]> {
  return page.evaluate(
    () => (window as unknown as { __violations: Violation[] }).__violations,
  );
}

/** appends <script src=gtag.js> and a no-cors GA collect, as gtag would */
async function tryGa(
  page: Page,
): Promise<{ script: string; collect: string; ran: boolean }> {
  return page.evaluate(
    async ({ gtag, collect }) => {
      const script = await new Promise<string>((resolve) => {
        const el = document.createElement("script");
        el.src = gtag;
        el.onload = () => resolve("load");
        el.onerror = () => resolve("error");
        document.head.append(el);
      });
      const sent = await fetch(collect, { mode: "no-cors" }).then(
        () => "sent",
        () => "blocked",
      );
      const ran =
        (window as unknown as { __gtagRan?: boolean }).__gtagRan === true;
      return { script, collect: sent, ran };
    },
    { gtag: GTAG_URL, collect: COLLECT_URL },
  );
}

/** favicons and every manifest icon load under the page's CSP */
async function iconsLoad(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const manifest = (await (await fetch("/manifest.json")).json()) as {
      icons: Array<{ src: string }>;
    };
    const srcs = [
      ...[
        ...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'),
      ].map((link) => link.href),
      ...manifest.icons.map((icon) => icon.src),
    ];
    return Promise.all(
      srcs.map(
        async (src) =>
          new Promise<string>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(`ok ${src}`);
            img.onerror = () => resolve(`error ${src}`);
            // fresh url: with page.route on, headless Chromium failed an <img>
            // of the favicon.ico the page already used, without a request
            img.src = `${src}?csp-check`;
          }),
      ),
    );
  });
}

for (const name of KIDS_PAGES) {
  for (const header of ["main", "none"] as const) {
    test(`${name} under ${header === "main" ? "the catch-all GA" : "no"} CSP header: meta blocks gtag`, async ({
      page,
    }) => {
      const metas = [...kidsHtml(name).matchAll(META_CSP_RE)];
      expect(metas).toHaveLength(1);
      const metaPolicy = metas[0]?.[1] ?? "";
      const seen = await stubNetwork(page);

      const response = await page.goto(
        `${origin}/guide/${name}?header=${header}`,
      );
      const served = response?.headers()["content-security-policy"];
      if (header === "main") {
        expect(served).toContain("https://www.googletagmanager.com");
      } else {
        expect(served).toBeUndefined();
      }
      await page.waitForLoadState("load");
      expect(
        await page.evaluate(() => sessionStorage.getItem("puggie-kids-flow")),
      ).toBe("1");
      const icons = await iconsLoad(page);
      expect(icons.length).toBeGreaterThanOrEqual(5);
      for (const icon of icons) {
        expect(icon).toMatch(/^ok /);
      }
      expect(await violations(page)).toEqual([]);

      expect(await tryGa(page)).toEqual({
        script: "error",
        collect: "blocked",
        ran: false,
      });
      expect(seen.google).toEqual([]);
      const blocked = await violations(page);
      expect(blocked.map((v) => [v.directive, v.blocked])).toEqual([
        ["script-src-elem", GTAG_URL],
        ["connect-src", COLLECT_URL],
      ]);
      // the meta is the blocking policy, not the header
      for (const violation of blocked) {
        expect(violation.policy).toBe(metaPolicy);
      }
      expect(seen.other).toEqual([]);
    });

    test(`${name} control: meta removed, ${header === "main" ? "catch-all GA" : "no"} header lets gtag load`, async ({
      page,
    }) => {
      const seen = await stubNetwork(page);
      await page.goto(`${origin}/guide/${name}?header=${header}&meta=0`);
      await page.waitForLoadState("load");
      expect(
        await page
          .locator('meta[http-equiv="Content-Security-Policy"]')
          .count(),
      ).toBe(0);
      expect(await tryGa(page)).toEqual({
        script: "load",
        collect: "sent",
        ran: true,
      });
      expect(seen.google).toEqual([GTAG_URL, COLLECT_URL]);
      expect(await violations(page)).toEqual([]);
      expect(seen.other).toEqual([]);
    });
  }
}
