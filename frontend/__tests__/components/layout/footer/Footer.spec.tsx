import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, it, expect, vi } from "vitest";

vi.mock("../../../../src/ts/states/test", () => ({
  getFocus: () => false,
  isTestActive: () => false,
}));
vi.mock("../../../../src/ts/components/layout/footer/Keytips", () => ({
  Keytips: () => null,
}));
vi.mock("../../../../src/ts/components/layout/footer/VersionButton", () => ({
  VersionButton: () => null,
}));
vi.mock("../../../../src/ts/components/layout/footer/ThemeIndicator", () => ({
  ThemeIndicator: () => null,
}));

import { Footer } from "../../../../src/ts/components/layout/footer/Footer";
import { getSourceLinks } from "../../../../vite-plugins/source-links";

// vitest's envConfig plugin gets no commit hash
const links = getSourceLinks({ commitHash: undefined, mode: "github" });

describe("Footer", () => {
  function legalNotice(): HTMLElement {
    const { getByTestId } = render(() => <Footer />);
    return getByTestId("legal-notice");
  }

  it("reads exactly 'Based on Monkeytype, GPL-3.0, no warranty, source'", () => {
    expect(legalNotice().textContent).toBe(
      "Based on Monkeytype, GPL-3.0, no warranty, source",
    );
  });

  it("links Monkeytype, the license and the source", () => {
    const anchors = [...legalNotice().querySelectorAll("a")].map((a) => [
      a.textContent,
      a.getAttribute("href"),
    ]);
    expect(anchors).toEqual([
      ["Monkeytype", "https://github.com/monkeytypegame/monkeytype"],
      ["GPL-3.0", links.licenseUrl],
      ["source", links.sourceUrl],
    ]);
  });
  it("offers privacy and cookie settings", () => {
    const { getByTestId } = render(() => <Footer />);
    expect(getByTestId("privacy-cookie-settings").textContent).toContain(
      "Privacy and cookie settings",
    );
  });

  it("links terms and privacy to /terms and /privacy", () => {
    const { container } = render(() => <Footer />);
    const hrefs = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain("/terms");
    expect(hrefs).toContain("/privacy");
    expect(hrefs.some((h) => h?.includes("security-policy"))).toBe(false);
  });

  it("links the static guide pages without router-link or a new tab", () => {
    const { getByTestId } = render(() => <Footer />);
    const anchors = [...getByTestId("guide-links").querySelectorAll("a")];
    expect(anchors.map((a) => [a.textContent, a.getAttribute("href")])).toEqual(
      [
        ["about", "/guide/about"],
        ["faq", "/faq"],
        ["guides", "/guide/"],
        ["contact", "/contact"],
        ["creators", "/creators"],
      ],
    );
    for (const a of anchors) {
      expect(a.hasAttribute("router-link")).toBe(false);
      expect(a.getAttribute("target")).toBeNull();
    }
  });
});

describe("Footer: Support PuggieType link", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const supportLink = (): HTMLElement | null =>
    render(() => <Footer />).queryByTestId("support-footer-link");

  it("flags off (default): no support link", () => {
    expect(supportLink()).toBeNull();
    const { container } = render(() => <Footer />);
    expect(container.textContent).not.toContain("Support PuggieType");
    expect(container.innerHTML).not.toMatch(/ko-fi|sponsors/);
  });

  for (const flag of ["__FEATURE_KOFI__", "__FEATURE_GITHUB_SPONSORS__"]) {
    it(`${flag} on: a quiet link to the About section`, () => {
      vi.stubGlobal(flag, true);
      const { getByTestId } = render(() => <Footer />);
      const link = getByTestId("support-footer-link");
      expect(link.textContent).toBe("Support PuggieType");
      expect(link.getAttribute("href")).toBe("/guide/about#support");
      expect(link.getAttribute("target")).toBeNull();
      expect(link.hasAttribute("router-link")).toBe(false);
      expect(link.closest('[data-testid="guide-links"]')).not.toBeNull();
    });
  }

  it("steam: hidden even with both flags on", () => {
    vi.stubGlobal("__FEATURE_KOFI__", true);
    vi.stubGlobal("__FEATURE_GITHUB_SPONSORS__", true);
    vi.stubGlobal("__PLATFORM__", "steam");
    expect(supportLink()).toBeNull();
  });
});
