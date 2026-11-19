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

// the bundled legal files must exist under these names (desktop/src/shell.mjs)
const LEGAL = [
  "/legal/LICENSE.txt",
  "/legal/NOTICE.txt",
  "/legal/ELECTRON-LICENSE.txt",
  "/legal/LICENSES.chromium.html",
  "/legal/SOURCE.txt",
  "/legal/DLC-ASSETS-LICENSE.txt",
];
const VALVE =
  "PuggieType is not affiliated with, endorsed or sponsored by Valve Corporation. Steam and the Steam logo are trademarks and/or registered trademarks of Valve Corporation in the U.S. and/or other countries.";
const norm = (s: string | null | undefined): string =>
  (s ?? "").replace(/\s+/g, " ").trim();

async function renderAbout(): Promise<HTMLElement> {
  vi.resetModules();
  const { AboutPage } =
    await import("../../../src/ts/components/pages/AboutPage");
  return render(() => <AboutPage />).container;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("About: desktop licenses and source (GPL bundling)", () => {
  it("steam: links every bundled license file and the source offer", async () => {
    vi.stubGlobal("__PLATFORM__", "steam");
    const el = await renderAbout();
    const section = el.querySelector('[data-testid="desktop-licenses"]');
    expect(section).not.toBeNull();
    const hrefs = [...(section?.querySelectorAll("a") ?? [])].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual(LEGAL);
    expect(section?.textContent).toContain("Supporter pack art licence");
    expect(
      norm(
        el.querySelector('[data-testid="valve-non-affiliation"]')?.textContent,
      ),
    ).toBe(VALVE);
    expect(
      norm(el.querySelector('[data-testid="steam-data-as-is"]')?.textContent),
    ).toBe("Steam data is provided as is, without warranty from Valve.");
    expect(el.textContent).not.toMatch(/puggietype is/);
    // credits, Monkeytype non-affiliation and the source link stay
    expect(el.textContent).toContain("not affiliated with");
    expect(
      el.querySelector('a[href="https://github.com/puggietype/puggietype"]'),
    ).not.toBeNull();
  });

  it("web: unchanged, no desktop licenses section", async () => {
    const el = await renderAbout();
    expect(el.querySelector('[data-testid="desktop-licenses"]')).toBeNull();
    expect(
      el.querySelector('[data-testid="valve-non-affiliation"]'),
    ).toBeNull();
    expect(el.querySelector('[data-testid="steam-data-as-is"]')).toBeNull();
    expect(el.textContent).toContain("PuggieType is not affiliated with");
  });

  it("the names match the desktop shell's LEGAL_FILES", async () => {
    // @ts-expect-error plain .mjs without types
    const shell = (await import("../../../../desktop/src/shell.mjs")) as {
      LEGAL_FILES: string[];
    };
    expect(shell.LEGAL_FILES.map((f) => `/legal/${f}`)).toEqual(LEGAL);
  });
});

describe("About: music credits (Legal, PR #30)", () => {
  const CREDIT =
    'music: "Sherwood" by Chris Murphy (zesona) and "calm theme" by pebonius (pebonius.itch.io), from OpenGameArt.org, released under CC0 1.0.';

  it("steam: shows the exact credit", async () => {
    vi.stubGlobal("__PLATFORM__", "steam");
    const el = await renderAbout();
    expect(
      norm(el.querySelector('[data-testid="music-credits"]')?.textContent),
    ).toBe(CREDIT);
    expect(el.querySelectorAll('[data-testid="music-credits"]')).toHaveLength(
      1,
    );
  });

  it("web: the same music credit, once, right after the quote credits", async () => {
    const el = await renderAbout();
    const credits = el.querySelectorAll('[data-testid="music-credits"]');
    expect(credits).toHaveLength(1);
    expect(norm(credits[0]?.textContent)).toBe(CREDIT);
    expect(
      credits[0]?.previousElementSibling?.getAttribute("data-testid"),
    ).toBe("quote-credits");
  });

  it("steam: right after the quote credits too", async () => {
    vi.stubGlobal("__PLATFORM__", "steam");
    const el = await renderAbout();
    const credit = el.querySelector('[data-testid="music-credits"]');
    expect(credit?.previousElementSibling?.getAttribute("data-testid")).toBe(
      "quote-credits",
    );
  });
});
