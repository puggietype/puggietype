import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

// Run against a production build (vite build + vite preview): dev builds
// load extra tooling. NETWORK_REPORT=<path> writes the host list there.

const BLOCKED = [
  /monkeytype\.com$/,
  /firebase/,
  /googleapis/,
  /gstatic/,
  /google-analytics/,
  /googletagmanager/,
  /sentry/,
  /playwire/,
  /recaptcha/,
  /instatus/,
  /^api\.github\.com$/,
];

async function typeFor(page: Page, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.locator("#result").isVisible()) return;
    const word = await page
      .locator("#words .word.active")
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    if (word === null) return;
    await page.keyboard.type(`${word} `, { delay: 50 });
  }
}

test("no requests to monkeytype, firebase, google or tracker hosts", async ({
  page,
  context,
}) => {
  await skipNgrokWarning(context);
  const hosts = new Set<string>();
  const record = (url: string): void => {
    const { protocol, hostname } = new URL(url);
    if (protocol === "data:" || protocol === "blob:") return;
    hosts.add(hostname);
  };
  context.on("request", (req) => record(req.url()));
  page.on("websocket", (ws) => record(ws.url()));

  await page.goto("/");
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("config") ?? "{}") as Record<
      string,
      unknown
    >;
    localStorage.setItem(
      "config",
      JSON.stringify({ ...saved, mode: "time", time: 15 }),
    );
  });
  await page.reload();
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });

  await typeFor(page, 25_000);
  await expect(page.locator("#result")).toBeVisible({ timeout: 10_000 });

  for (const path of ["/settings", "/about"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }

  const list = [...hosts].sort();
  const bad = list.filter((h) => BLOCKED.some((re) => re.test(h)));

  const out = process.env["NETWORK_REPORT"];
  if (out !== undefined && out !== "") {
    const commit = execSync("git rev-parse --short HEAD").toString().trim();
    writeFileSync(
      out,
      [
        `# request hostnames: 15s solo test, /settings, /about`,
        `date: ${new Date().toISOString()}`,
        `commit: ${commit}`,
        `base: ${test.info().project.use.baseURL ?? ""}`,
        "",
        ...list,
        "",
        bad.length === 0 ? "PASS" : `FAIL: ${bad.join(", ")}`,
        "",
      ].join("\n"),
    );
  }

  expect(bad).toEqual([]);
});
