import { mkdirSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

/** SCREENS_DIR, else e2e/screens (gitignored) */
const SCREENS = process.env["SCREENS_DIR"] ?? "e2e/screens";
mkdirSync(SCREENS, { recursive: true });

async function openWithConfig(
  page: Page,
  config: Record<string, unknown>,
): Promise<void> {
  // window.__mt only exists in dev builds; production builds get the config
  // through localStorage (merged into whatever is saved) and a reload
  await page.goto("/");
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
  const hasDevHandle = await page.evaluate(() => "__mt" in window);
  if (hasDevHandle) {
    await page.evaluate((cfg) => {
      const mt = (
        window as unknown as {
          __mt: { setConfig: (k: string, v: unknown) => void };
        }
      ).__mt;
      for (const [k, v] of Object.entries(cfg)) mt.setConfig(k, v);
    }, config);
    return;
  }
  await page.evaluate((cfg) => {
    const saved = JSON.parse(localStorage.getItem("config") ?? "{}") as Record<
      string,
      unknown
    >;
    localStorage.setItem("config", JSON.stringify({ ...saved, ...cfg }));
  }, config);
  await page.reload();
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
}

test.beforeEach(async ({ context }) => {
  await skipNgrokWarning(context);
});

const cases = [
  { theme: "puggie_dark", file: "solo-pug.png", fill: "#f3e4ca", mono: false },
  {
    theme: "puggie_light",
    file: "solo-pug-light.png",
    fill: "#f4e5cb",
    mono: false,
  },
  { theme: "serika_dark", file: undefined, fill: "#ffffff", mono: true },
];

for (const c of cases) {
  test(`pug paw goes down while typing (${c.theme})`, async ({ page }) => {
    await openWithConfig(page, { theme: c.theme, monkey: true });
    const words = await page.$$eval("#words .word", (els) =>
      els.slice(0, 4).map((el) => el.textContent ?? ""),
    );
    await page.keyboard.type(`${words.join(" ")} `, { delay: 60 });
    // hold a left-hand key so the paw stays down
    await page.keyboard.down("a");

    const pug = page.locator('[data-ui-element="pug"]');
    await expect(pug).toHaveAttribute("data-frame", "left");
    await expect(pug.locator("svg").first()).toBeAttached();
    const state = await pug.evaluate((el) => ({
      mono: document.documentElement.dataset["pug"] === "mono",
      fill: getComputedStyle(el)
        .getPropertyValue("--pug-fill")
        .trim()
        .toLowerCase()
        // production CSS minification shortens #ffffff to #fff
        .replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, "#$1$1$2$2$3$3"),
    }));
    expect(state).toEqual({ mono: c.mono, fill: c.fill });

    if (c.file !== undefined) {
      await page.screenshot({ path: `${SCREENS}/${c.file}` });
    }
    await page.keyboard.up("a");
  });
}
