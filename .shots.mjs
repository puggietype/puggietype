import { chromium } from "@playwright/test";
const [, , mode, U = "http://localhost:3101"] = process.argv;
const b = await chromium.launch();
async function open(theme, w, h, dpr = 1) {
  const c = await b.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: dpr,
  });
  const p = await c.newPage();
  await p.goto(U);
  await p.locator("#words .word").first().waitFor({ timeout: 60000 });
  await p.evaluate((t) => {
    const s = JSON.parse(localStorage.getItem("config") ?? "{}");
    localStorage.setItem(
      "config",
      JSON.stringify({ ...s, theme: t, monkey: true }),
    );
  }, theme);
  await p.reload();
  await p.locator("#words .word").first().waitFor({ timeout: 60000 });
  await p.waitForTimeout(800);
  return { c, p };
}
if (mode === "logo") {
  for (const theme of ["puggie_dark", "puggie_light"])
    for (const w of [1280, 1920]) {
      const { c, p } = await open(theme, w, 900, 2);
      const a = await p
        .locator('[data-ui-element="logoSubtext"]')
        .boundingBox();
      const t = await p.locator('[data-ui-element="logoText"]').boundingBox();
      const overlap =
        a &&
        t &&
        !(
          a.y + a.height <= t.y ||
          t.y + t.height <= a.y ||
          a.x + a.width <= t.x ||
          t.x + t.width <= a.x
        );
      console.log(
        theme,
        w,
        "tagline",
        JSON.stringify(a),
        "word",
        JSON.stringify(t),
        "overlap",
        overlap,
      );
      await p.screenshot({
        path: `/workspace/puggietype/screens/logo-${theme}-${w}.png`,
        clip: { x: 0, y: 0, width: 520, height: 110 },
      });
      await c.close();
    }
} else {
  const themes = [
    "puggie_dark",
    "puggie_light",
    "midnight_chow",
    "serika_dark",
  ];
  for (const theme of themes) {
    const { c, p } = await open(theme, 1280, 800, 2);
    const words = await p.$$eval("#words .word", (e) =>
      e.slice(0, 5).map((x) => x.textContent),
    );
    await p.keyboard.type(words.join(" ") + " ", { delay: 60 });
    await p.keyboard.down("a");
    await p.waitForTimeout(150);
    await p
      .locator('[data-ui-element="pug"]')
      .screenshot({ path: `/tmp/pug-${mode}-${theme}.png` });
    await p.keyboard.up("a");
    await c.close();
  }
}
await b.close();
