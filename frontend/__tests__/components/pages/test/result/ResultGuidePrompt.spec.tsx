import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getIsScreenshotting } = vi.hoisted(() => ({
  getIsScreenshotting: vi.fn(() => false),
}));
vi.mock("../../../../../src/ts/states/core", () => ({ getIsScreenshotting }));

import {
  getResultGuideTip,
  ResultGuidePrompt,
} from "../../../../../src/ts/components/pages/test/result/ResultGuidePrompt";

describe("getResultGuideTip", () => {
  it("points to the accuracy guide below 95%", () => {
    expect(getResultGuideTip(94.99).href).toBe("/guide/improve-accuracy");
    expect(getResultGuideTip(50).href).toBe("/guide/improve-accuracy");
  });
  it("points to the practice plan from 95%", () => {
    expect(getResultGuideTip(95).href).toBe("/guide/type-faster");
    expect(getResultGuideTip(100).href).toBe("/guide/type-faster");
  });
});

describe("ResultGuidePrompt", () => {
  afterEach(() => {
    cleanup();
    getIsScreenshotting.mockReturnValue(false);
  });

  it("renders one descriptive link", () => {
    const { container } = render(() => <ResultGuidePrompt acc={98} />);
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/guide/type-faster");
    expect(links[0]).toHaveTextContent("practice plan for typing faster");
    expect(container.textContent).toBe(
      "Want to get faster? Our guide has a practice plan for typing faster.",
    );
  });

  it("is left out of screenshots", () => {
    getIsScreenshotting.mockReturnValue(true);
    const { container } = render(() => <ResultGuidePrompt acc={80} />);
    expect(container.querySelector("a")).toBeNull();
  });
});
