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
];

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
    expect(section?.textContent).toContain(
      "not affiliated with Valve or Steam",
    );
    // credits, Monkeytype non-affiliation and the source link stay
    expect(el.textContent).toContain("not affiliated with");
    expect(
      el.querySelector('a[href="https://github.com/puggietype/puggietype"]'),
    ).not.toBeNull();
  });

  it("web: unchanged, no desktop licenses section", async () => {
    const el = await renderAbout();
    expect(el.querySelector('[data-testid="desktop-licenses"]')).toBeNull();
  });

  it("the names match the desktop shell's LEGAL_FILES", async () => {
    // @ts-expect-error plain .mjs without types
    const shell = (await import("../../../../desktop/src/shell.mjs")) as {
      LEGAL_FILES: string[];
    };
    expect(shell.LEGAL_FILES.map((f) => `/legal/${f}`)).toEqual(LEGAL);
  });
});
