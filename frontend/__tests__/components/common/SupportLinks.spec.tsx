import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

const configured = {
  KOFI_URL: "https://ko-fi.com/puggietype",
  SPONSORS_URL: "https://github.com/sponsors/puggietype",
};

vi.mock("../../../src/ts/constants/support", () => {
  const SUPPORT_LINKS = {
    KOFI_URL: "https://ko-fi.com/puggietype",
    SPONSORS_URL: "https://github.com/sponsors/puggietype",
  };
  return {
    SUPPORT_LINKS,
    supportLinksEnabled: (
      links: { KOFI_URL: string; SPONSORS_URL: string } = SUPPORT_LINKS,
    ): boolean =>
      links.KOFI_URL.trim() !== "" && links.SPONSORS_URL.trim() !== "",
  };
});
vi.mock("../../../src/ts/components/hotkeys/QuickRestartHotkey", () => ({
  QuickRestartHotkey: () => null,
}));
vi.mock("../../../src/ts/components/hotkeys/CommandlineHotkey", () => ({
  CommandlineHotkey: () => null,
}));
vi.mock("../../../src/ts/states/test", () => ({
  getFocus: () => false,
}));
vi.mock("../../../src/ts/components/layout/footer/Keytips", () => ({
  Keytips: () => null,
}));
vi.mock("../../../src/ts/components/layout/footer/VersionButton", () => ({
  VersionButton: () => null,
}));
vi.mock("../../../src/ts/components/layout/footer/ThemeIndicator", () => ({
  ThemeIndicator: () => null,
}));

import { SupportLinks } from "../../../src/ts/components/common/SupportLinks";
import { Footer } from "../../../src/ts/components/layout/footer/Footer";
import { AboutPage } from "../../../src/ts/components/pages/AboutPage";

describe("support links when both URLs are set", () => {
  it("offers Ko-fi first in the footer, with GitHub Sponsors beside it", () => {
    const { getByTestId, container } = render(() => (
      <SupportLinks variant="footer" />
    ));
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
        configured.KOFI_URL,
        "Support PuggieType on Ko-fi (opens in a new tab)",
        "_blank",
        "noopener noreferrer",
      ],
      [
        "GitHub Sponsors",
        configured.SPONSORS_URL,
        "Support PuggieType on GitHub Sponsors (opens in a new tab)",
        "_blank",
        "noopener noreferrer",
      ],
    ]);
    expect(anchors[0]?.className).toContain("font-semibold");
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("keeps the footer row inside the region that fades while typing", () => {
    const { getByTestId } = render(() => <Footer />);
    const support = getByTestId("support-links");
    expect(support.closest(".transition-opacity")?.contains(support)).toBe(
      true,
    );
  });

  it("puts a Tip options nav on the about page", () => {
    const { getByTestId, getByRole } = render(() => <AboutPage />);
    expect(getByRole("heading", { name: "support" }).id).toBe(
      "support-heading",
    );
    const nav = getByTestId("support-links");
    expect(nav.getAttribute("aria-label")).toBe("Tip options");
    const anchors = [...nav.querySelectorAll("a")];
    expect(anchors.map((a) => a.getAttribute("rel"))).toEqual([
      "noopener noreferrer",
      "noopener noreferrer",
    ]);
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      configured.KOFI_URL,
      configured.SPONSORS_URL,
    ]);
    expect(anchors.map((a) => a.getAttribute("data-ui-variant"))).toEqual([
      "button",
      "text",
    ]);
  });
});
