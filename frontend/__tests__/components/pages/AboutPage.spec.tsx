import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/ts/components/hotkeys/QuickRestartHotkey", () => ({
  QuickRestartHotkey: () => null,
}));
vi.mock("../../../src/ts/components/hotkeys/CommandlineHotkey", () => ({
  CommandlineHotkey: () => null,
}));

import { AboutPage } from "../../../src/ts/components/pages/AboutPage";
import { SUPPORT_LINKS } from "../../../src/ts/constants/support";

describe("AboutPage support", () => {
  it("puts Ko-fi first and GitHub Sponsors beside it", () => {
    const { getByTestId, getByRole } = render(() => <AboutPage />);
    expect(getByRole("heading", { name: "support" }).id).toBe(
      "support-heading",
    );
    const nav = getByTestId("support-links");
    expect(nav.getAttribute("aria-label")).toBe("Tip options");
    const anchors = [...nav.querySelectorAll("a")];
    expect(
      anchors.map((a) => [
        a.textContent,
        a.getAttribute("href"),
        a.getAttribute("aria-label"),
        a.getAttribute("data-ui-variant"),
        a.getAttribute("target"),
        a.getAttribute("rel"),
      ]),
    ).toEqual([
      [
        "Ko-fi",
        SUPPORT_LINKS.KOFI_URL,
        "Support PuggieType on Ko-fi (opens in a new tab)",
        "button",
        "_blank",
        "noreferrer noopener",
      ],
      [
        "GitHub Sponsors",
        SUPPORT_LINKS.SPONSORS_URL,
        "Support PuggieType on GitHub Sponsors (opens in a new tab)",
        "text",
        "_blank",
        "noreferrer noopener",
      ],
    ]);
    for (const a of anchors) {
      expect(a.getAttribute("href")).not.toMatch(/[?#]/);
    }
  });
});
