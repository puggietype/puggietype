import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/ts/components/hotkeys/QuickRestartHotkey", () => ({
  QuickRestartHotkey: () => null,
}));
vi.mock("../../../src/ts/components/hotkeys/CommandlineHotkey", () => ({
  CommandlineHotkey: () => null,
}));

import { AboutPage } from "../../../src/ts/components/pages/AboutPage";

describe("AboutPage support", () => {
  it("renders no support section while the tip URLs are empty", () => {
    const { queryByRole, queryByTestId, container } = render(() => (
      <AboutPage />
    ));
    expect(queryByRole("heading", { name: "support" })).toBeNull();
    expect(queryByTestId("support-links")).toBeNull();
    expect(container.textContent).not.toContain("Ko-fi");
    expect(container.textContent).not.toContain("GitHub Sponsors");
  });
});
