import { render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, it, expect, vi, beforeEach } from "vitest";

const [resultVisible, setResultVisible] = createSignal(false);

vi.mock("../../../../src/ts/states/test", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getResultVisible: () => resultVisible(),
  getFocus: () => false,
}));

// a resource deep in the import graph fetches static json; no network here
vi.mock("../../../../src/ts/hooks/useResourceWithPromise", () => ({
  useResourceWithPromise: () => [
    () => undefined,
    { promise: new Promise<void>(() => undefined), reset: () => undefined },
  ],
}));

import { TestConfig } from "../../../../src/ts/components/pages/test/TestConfig";

describe("TestConfig mobile test settings pill", () => {
  beforeEach(() => setResultVisible(false));

  function pill(): HTMLElement {
    const { getByTestId } = render(() => <TestConfig />);
    return getByTestId("mobile-test-settings");
  }

  it("shows on the test page", () => {
    const el = pill();
    expect(el.classList.contains("opacity-0")).toBe(false);
    expect(el.classList.contains("pointer-events-none")).toBe(false);
    expect(el.getAttribute("tabindex")).toBeNull();
    expect(el.getAttribute("aria-hidden")).toBeNull();
  });

  it("hides like the desktop bar while the result is showing", () => {
    const el = pill();
    setResultVisible(true);
    expect(el.classList.contains("opacity-0")).toBe(true);
    expect(el.classList.contains("pointer-events-none")).toBe(true);
    expect(el.getAttribute("tabindex")).toBe("-1");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    setResultVisible(false);
    expect(el.classList.contains("opacity-0")).toBe(false);
  });
});
