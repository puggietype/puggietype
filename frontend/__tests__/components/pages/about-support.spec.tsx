import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/ts/components/common/PugHead", () => ({
  PugHead: () => null,
}));
vi.mock("../../../src/ts/components/hotkeys/CommandlineHotkey", () => ({
  CommandlineHotkey: () => null,
}));
vi.mock("../../../src/ts/components/hotkeys/QuickRestartHotkey", () => ({
  QuickRestartHotkey: () => null,
}));

import { AboutPage } from "../../../src/ts/components/pages/AboutPage";

const INTRO =
  "PuggieType is a free typing test, made by a small team in our spare time. If you enjoy it and want to help with server and hosting costs, you can leave an optional tip on";
const DISCLAIMER =
  "Tips are voluntary gifts to the PuggieType team. PuggieType is not a charity or nonprofit, and tips aren't tax-deductible as charitable donations. Tips don't unlock any features, perks or rewards. Tips go to the PuggieType team only, not to the Monkeytype project. Please ask a parent or guardian before tipping if you're under 18. Questions or a mistaken tip? Email support@puggietype.com.";
const KOFI = ["Leave a tip on Ko-fi", "https://ko-fi.com/puggietype"];
const SPONSORS = [
  "Leave a tip on GitHub Sponsors",
  "https://github.com/sponsors/puggietype",
];
const norm = (s: string | null | undefined): string =>
  (s ?? "").replace(/\s+/g, " ").trim();

function renderAbout(): HTMLElement {
  return render(() => <AboutPage />).container;
}

function section(el: HTMLElement): Element | null {
  return el.querySelector('[data-testid="support-section"]');
}

function expectNoSupport(el: HTMLElement): void {
  expect(section(el)).toBeNull();
  expect(el.textContent).not.toContain("Support PuggieType");
  expect(el.innerHTML).not.toContain("ko-fi.com");
  expect(el.innerHTML).not.toContain("github.com/sponsors");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("About: Support PuggieType section", () => {
  it("flags off (default): no section", () => {
    expectNoSupport(renderAbout());
  });

  it("steam: no section even with both flags on", () => {
    vi.stubGlobal("__FEATURE_KOFI__", true);
    vi.stubGlobal("__FEATURE_GITHUB_SPONSORS__", true);
    vi.stubGlobal("__PLATFORM__", "steam");
    const el = renderAbout();
    expectNoSupport(el);
    // the steam-only credits still render
    expect(el.querySelector('[data-testid="desktop-licenses"]')).not.toBeNull();
  });

  for (const [name, flags, links, intro] of [
    ["Ko-fi only", ["__FEATURE_KOFI__"], [KOFI], `${INTRO} Ko-fi.`],
    [
      "Sponsors only",
      ["__FEATURE_GITHUB_SPONSORS__"],
      [SPONSORS],
      `${INTRO} GitHub Sponsors.`,
    ],
    [
      "both",
      ["__FEATURE_KOFI__", "__FEATURE_GITHUB_SPONSORS__"],
      [KOFI, SPONSORS],
      `${INTRO} Ko-fi or GitHub Sponsors.`,
    ],
  ] as const) {
    it(`${name}: exact copy, links and disclaimer`, () => {
      for (const flag of flags) vi.stubGlobal(flag, true);
      const el = renderAbout();
      const s = section(el);
      expect(s).not.toBeNull();
      expect(s?.id).toBe("support");
      expect(norm(s?.querySelector("h2")?.textContent)).toBe(
        "Support PuggieType",
      );
      expect(
        norm(s?.querySelector('[data-testid="support-intro"]')?.textContent),
      ).toBe(intro);

      const tips = [
        ...(s?.querySelectorAll('[data-testid="support-links"] a') ?? []),
      ];
      expect(
        tips.map((a) => [norm(a.textContent), a.getAttribute("href")]),
      ).toEqual(links.map((l) => [...l]));
      for (const a of tips) {
        expect(a.getAttribute("target")).toBe("_blank");
        expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      }

      const disclaimer = s?.querySelector('[data-testid="support-disclaimer"]');
      expect(norm(disclaimer?.textContent)).toBe(DISCLAIMER);
      expect(disclaimer?.querySelector("a")?.getAttribute("href")).toBe(
        "mailto:support@puggietype.com",
      );
      // disclaimer sits right after the links
      expect(
        disclaimer?.previousElementSibling?.getAttribute("data-testid"),
      ).toBe("support-links");
      expect(s?.innerHTML).not.toMatch(/<script|<iframe|<img/);
    });
  }
});
