import { expect, test, type Page } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

// Standalone build (no BACKEND_URL): nothing account-related is reachable.

test.beforeEach(async ({ context }) => {
  await skipNgrokWarning(context);
});

async function expect404(page: Page): Promise<void> {
  const page404 = page.locator("#page404:visible");
  await expect(page404.first()).toBeVisible({ timeout: 30_000 });
  await expect(page404.first()).toContainText(/page not found/i);
  await expect(page404.first().locator('a[href="/"]')).toBeVisible();
  await expect(page404.first().locator('a[href="/race"]')).toBeVisible();
  await expect(page404.first().locator("svg, .image").first()).toBeVisible();
}

for (const path of [
  "/login",
  "/account",
  "/account-settings",
  "/friends",
  "/profile",
  "/profile/someone",
  "/leaderboards",
  "/verify",
  "/definitely-not-a-page",
]) {
  test(`${path} renders the 404 page`, async ({ page }) => {
    await page.goto(path);
    await expect404(page);
  });
}

test("nav has no account, leaderboard or alerts buttons", async ({ page }) => {
  await page.goto("/");
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
  const nav = page.locator("header nav");
  await expect(nav.locator('[data-nav-item="race"]')).toBeVisible();
  for (const item of [
    "leaderboards",
    "alerts",
    "login",
    "account",
    "friends",
  ]) {
    await expect(nav.locator(`[data-nav-item="${item}"]`)).toHaveCount(0);
  }
  await expect(page.locator('[data-ui-element="accountMenu"]')).toHaveCount(0);
});

test("settings hide account-only options", async ({ page }) => {
  await page.goto("/settings");
  const settings = page.locator("#pageSettings");
  await expect(settings.getByText("pace caret", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  for (const text of ["show average", "result saving", "tags", "presets"]) {
    await expect(settings.getByText(text, { exact: true })).toHaveCount(0);
  }
  for (const option of ["pb", "tag pb", "average", "daily"]) {
    await expect(
      settings.getByRole("button", { name: option, exact: true }),
    ).toHaveCount(0);
  }
  for (const option of ["off", "last", "custom"]) {
    await expect(
      settings.getByRole("button", { name: option, exact: true }).first(),
    ).toBeVisible();
  }
  await expect(settings.locator('a[href="/account-settings"]')).toHaveCount(0);
});

test("commandline has no account-only commands", async ({ page }) => {
  await page.goto("/");
  await page.locator("#words .word").first().waitFor({ timeout: 60_000 });
  await page.keyboard.press("Escape");
  const input = page.locator("#CommandlineModal input[type=text]");
  await expect(input).toBeVisible();
  const rows = page.locator("#CommandlineModal [data-index]");

  // each query has a visible control row, so an empty list can't pass
  const cases: { query: string; shown: string; hidden: RegExp }[] = [
    {
      query: "view",
      shown: "View Settings Page",
      hidden: /leaderboards|account/i,
    },
    { query: "search", shown: "Search for quotes", hidden: /profile/i },
    {
      query: "show",
      shown: "Show all lines",
      hidden: /average|personal best/i,
    },
    {
      query: "pace caret",
      shown: "Pace caret modelast",
      hidden: /modepb|modetagPb|modeaverage|modedaily/,
    },
    { query: "saving", shown: "", hidden: /result saving/i },
  ];
  for (const c of cases) {
    await input.fill(c.query);
    if (c.shown !== "") {
      await expect(rows.filter({ hasText: c.shown }).first()).toBeVisible();
    } else {
      await page.waitForTimeout(500);
    }
    const texts = await rows.allTextContents();
    expect(
      texts.filter((t) => c.hidden.test(t)),
      c.query,
    ).toEqual([]);
  }
});
