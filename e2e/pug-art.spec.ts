import { mkdirSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/** SCREENS_DIR, else the brand workspace if present, else test-results */
function screensDir(): string {
  for (const dir of [
    process.env["SCREENS_DIR"],
    "/workspace/puggietype/screens",
    "test-results/screens",
  ]) {
    if (dir === undefined) continue;
    try {
      mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      // not writable here, try the next one
    }
  }
  return ".";
}
const SCREENS = screensDir();

async function openWithConfig(
  page: Page,
  config: Record<string, unknown>,
): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(() => "__mt" in window, null, {
    timeout: 60_000,
  });
  await page.evaluate((cfg) => {
    const mt = (
      window as unknown as {
        __mt: { setConfig: (k: string, v: unknown) => void };
      }
    ).__mt;
    for (const [k, v] of Object.entries(cfg)) mt.setConfig(k, v);
  }, config);
}

const cases = [
  { theme: "puggie_dark", file: "solo-pug.png", fill: "#f0d9b5", mono: false },
  {
    theme: "puggie_light",
    file: "solo-pug-light.png",
    fill: "#f3dcb8",
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
      fill: getComputedStyle(el).getPropertyValue("--pug-fill").trim(),
    }));
    expect(state).toEqual({ mono: c.mono, fill: c.fill });

    if (c.file !== undefined) {
      await page.screenshot({ path: `${SCREENS}/${c.file}` });
    }
    await page.keyboard.up("a");
  });
}
