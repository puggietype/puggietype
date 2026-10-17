import { expect, test, type Browser, type Page } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

// F01: the tagline must never touch the wordmark, whatever the width, DPR
// (browser zoom is a DPR change too) or font-load state. Checked twice: the
// element boxes must not intersect, and the painted pixels (ink) of the
// tagline must sit fully above the ink of the wordmark.

type Box = { x: number; y: number; width: number; height: number };

// lg is 1105px here (tailwind.css): below it the tagline is not rendered,
// so 1024 checks it stays hidden and 1105 is the tightest visible case
const WIDTHS = [1024, 1105, 1440, 1920];
const LG = 1105;
const DPRS = [1, 2];

async function open(
  browser: Browser,
  width: number,
  dpr: number,
  blockFonts: boolean,
): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: dpr,
  });
  await skipNgrokWarning(context);
  // fallback-font state: what users see before (or without) the webfont
  if (blockFonts) {
    await context.route(/\.(woff2?|ttf)(\?|$)/, async (r) => r.abort());
  }
  const page = await context.newPage();
  await page.goto("/");
  await page
    .locator("[data-ui-element='logoSubtext']")
    .waitFor({ state: "attached" });
  await page.evaluate(async () => document.fonts.ready);
  return page;
}

/** rows (css px, relative to clip) that contain non-background pixels */
async function inkRows(page: Page, clip: Box, hide: string): Promise<number[]> {
  await page.addStyleTag({
    content: `[data-ui-element='${hide}']{color:transparent!important}`,
  });
  const png = await page.screenshot({ clip, animations: "disabled" });
  await page.evaluate(() => {
    document.querySelectorAll("style").forEach((s) => {
      if (s.textContent?.includes("transparent!important")) s.remove();
    });
  });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    const bg = [data[0], data[1], data[2]];
    const scale = window.devicePixelRatio;
    const rows = new Set<number>();
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        const diff =
          Math.abs((data[i] ?? 0) - (bg[0] ?? 0)) +
          Math.abs((data[i + 1] ?? 0) - (bg[1] ?? 0)) +
          Math.abs((data[i + 2] ?? 0) - (bg[2] ?? 0));
        if (diff > 60) {
          rows.add(y / scale);
          break;
        }
      }
    }
    return [...rows];
  }, png.toString("base64"));
}

async function checkLogo(page: Page): Promise<void> {
  const tagline = page.locator("[data-ui-element='logoSubtext']");
  const word = page.locator("[data-ui-element='logoText']");
  await expect(tagline).toBeVisible();
  await expect(tagline).toHaveText("type fast. stay cute.");

  const t = (await tagline.boundingBox()) as Box;
  const w = (await word.boundingBox()) as Box;
  expect(t.height).toBeGreaterThan(0);
  // boxes: tagline above the wordmark, no vertical intersection
  expect(t.y + t.height).toBeLessThanOrEqual(w.y + 0.5);

  // ink: clip around both (glyphs overflow the tight 0.75 line box)
  const pad = 12;
  const clip = {
    x: Math.max(0, Math.min(t.x, w.x) - 2),
    y: Math.max(0, t.y - pad),
    width: Math.max(t.x + t.width, w.x + w.width) - Math.min(t.x, w.x) + 4,
    height: w.y + w.height + pad - (t.y - pad),
  };
  const tagRows = await inkRows(page, clip, "logoText");
  const wordRows = await inkRows(page, clip, "logoSubtext");
  expect(tagRows.length).toBeGreaterThan(0);
  expect(wordRows.length).toBeGreaterThan(0);
  const tagBottom = Math.max(...tagRows);
  const wordTop = Math.min(...wordRows);
  // at least ~1 css px of clear space between the two
  expect(wordTop - tagBottom).toBeGreaterThanOrEqual(1);
}

for (const dpr of DPRS) {
  for (const width of WIDTHS) {
    test(`logo tagline clears wordmark at ${width}px dpr ${dpr}`, async ({
      browser,
    }) => {
      const page = await open(browser, width, dpr, false);
      if (width < LG) {
        await expect(
          page.locator("[data-ui-element='logoSubtext']"),
        ).toBeHidden();
      } else {
        await checkLogo(page);
      }
      await page.context().close();
    });
  }
  test(`logo tagline clears wordmark with fallback font dpr ${dpr}`, async ({
    browser,
  }) => {
    const page = await open(browser, 1440, dpr, true);
    await checkLogo(page);
    await page.context().close();
  });
}
