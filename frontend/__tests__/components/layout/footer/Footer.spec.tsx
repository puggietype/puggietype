import { render } from "@solidjs/testing-library";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../../src/ts/states/test", () => ({
  getFocus: () => false,
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
import { SUPPORT_LINKS } from "../../../../src/ts/constants/support";
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
        ["guides", "/guide/typing-tips"],
        ["contact", "/contact"],
      ],
    );
    for (const a of anchors) {
      expect(a.hasAttribute("router-link")).toBe(false);
      expect(a.getAttribute("target")).toBeNull();
    }
  });

  it("offers Ko-fi as the primary tip link and GitHub Sponsors beside it", () => {
    const { getByTestId } = render(() => <Footer />);
    const nav = getByTestId("support-links");
    expect(nav.getAttribute("aria-label")).toBe("Support PuggieType");
    const anchors = [...nav.querySelectorAll("a")];
    expect(
      anchors.map((a) => [
        a.textContent,
        a.getAttribute("href"),
        a.getAttribute("aria-label"),
        a.getAttribute("target"),
        a.getAttribute("rel"),
      ]),
    ).toEqual([
      [
        "Ko-fi",
        SUPPORT_LINKS.KOFI_URL,
        "Support PuggieType on Ko-fi (opens in a new tab)",
        "_blank",
        "noopener noreferrer",
      ],
      [
        "GitHub Sponsors",
        SUPPORT_LINKS.SPONSORS_URL,
        "Support PuggieType on GitHub Sponsors (opens in a new tab)",
        "_blank",
        "noopener noreferrer",
      ],
    ]);
    expect(anchors[0]?.className).toContain("font-semibold");
    for (const a of anchors) {
      expect(a.getAttribute("href")).not.toMatch(/[?#]/);
    }
  });

  it("keeps the tip links in the region that fades while typing", () => {
    const { getByTestId, container } = render(() => <Footer />);
    const support = getByTestId("support-links");
    const fading = support.closest(".transition-opacity");
    expect(fading?.contains(support)).toBe(true);
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });
});
