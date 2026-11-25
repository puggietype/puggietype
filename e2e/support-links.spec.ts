import { expect, test, type Page } from "@playwright/test";

import { skipNgrokWarning } from "./tunnel";

// Ko-fi / GitHub Sponsors are build flags (VITE_FEATURE_KOFI,
// VITE_FEATURE_GITHUB_SPONSORS), off by default. The flags-on checks skip on
// a flags-off build; the kids checks run on every build.

const KOFI = "https://ko-fi.com/puggietype";
const SPONSORS = "https://github.com/sponsors/puggietype";
const DISCLAIMER =
  "Tips are voluntary gifts to the PuggieType team. PuggieType is not a charity or nonprofit, and tips aren't tax-deductible as charitable donations. Tips don't unlock any features, perks or rewards. Tips go to the PuggieType team only, not to the Monkeytype project. Please ask a parent or guardian before tipping if you're under 18. Questions or a mistaken tip? Email support@puggietype.com.";

const norm = (s: string | null): string =>
  (s ?? "").replace(/\s+/g, " ").trim();

test.beforeEach(async ({ context }) => {
  await skipNgrokWarning(context);
});

/** true when this build shows the About support section */
async function supportBuild(page: Page): Promise<boolean> {
  await page.goto("/guide/about");
  return (await page.getByTestId("support-section").count()) > 0;
}

test.describe("support links: flags-on build", () => {
  test("About shows the section, flagged links and the disclaimer", async ({
    page,
  }) => {
    test.skip(
      !(await supportBuild(page)),
      "flags-off build: no support section on /guide/about (set VITE_FEATURE_KOFI and/or VITE_FEATURE_GITHUB_SPONSORS)",
    );
    const section = page.getByTestId("support-section");
    await expect(section).toHaveAttribute("id", "support");
    await expect(
      section.getByRole("heading", { name: "Support PuggieType" }),
    ).toBeVisible();
    expect(
      norm(await page.getByTestId("support-disclaimer").textContent()),
    ).toBe(DISCLAIMER);

    const tips = section.locator(`a[href="${KOFI}"], a[href="${SPONSORS}"]`);
    const count = await tips.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(tips.nth(i)).toHaveAttribute("target", "_blank");
      await expect(tips.nth(i)).toHaveAttribute("rel", "noopener noreferrer");
    }
    const hasKofi = (await section.locator(`a[href="${KOFI}"]`).count()) > 0;
    const hasSponsors =
      (await section.locator(`a[href="${SPONSORS}"]`).count()) > 0;
    const on = [hasKofi && "Ko-fi", hasSponsors && "GitHub Sponsors"].filter(
      Boolean,
    );
    expect(norm(await page.getByTestId("support-intro").textContent())).toMatch(
      new RegExp(`leave an optional tip on ${on.join(" or ")}\\.$`),
    );
    await expect(section.locator("script, iframe, img")).toHaveCount(0);
  });

  test("non-kids footer links to /guide/about#support in the same tab", async ({
    page,
  }) => {
    test.skip(
      !(await supportBuild(page)),
      "flags-off build: no support section on /guide/about",
    );
    await page.goto("/faq");
    const link = page.getByTestId("support-footer-link");
    await expect(link).toHaveCount(1);
    await expect(link).toHaveText("Support PuggieType");
    await expect(link).toHaveAttribute("href", "/guide/about#support");
    await expect(link).not.toHaveAttribute("target", /.*/);
    await link.click();
    await expect(page).toHaveURL(/\/guide\/about#support$/);
    await expect(page.getByTestId("support-section")).toBeVisible();
  });
});

test.describe("support links: kids guides (every build)", () => {
  for (const path of [
    "/guide/teaching-kids-to-type",
    "/guide/typing-for-kids",
  ]) {
    test(`${path}: no support text or tip links`, async ({ page }) => {
      await page.goto(path);
      const html = await page.content();
      expect(html).not.toContain("Support PuggieType");
      expect(html).not.toContain("ko-fi.com");
      expect(html).not.toContain("github.com/sponsors");
      await expect(page.getByTestId("support-footer-link")).toHaveCount(0);
      await expect(page.getByTestId("support-section")).toHaveCount(0);
    });
  }
});
