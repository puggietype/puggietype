import { afterEach, describe, expect, it, vi } from "vitest";

const notice = vi.hoisted(() => vi.fn());
vi.mock("../../src/ts/states/notifications", () => ({
  showNoticeNotification: notice,
}));

import { placeholderAdProvider } from "../../src/ts/ads/placeholder";

const spec = { kind: "rail" as const, width: 160, height: 600, slotId: "R" };

describe("placeholder ad provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders a labelled box and makes no network request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const before = document.querySelectorAll("script, iframe").length;
    const slot = document.createElement("div");
    expect(await placeholderAdProvider.prepare({ consentUi: false })).toBe(
      true,
    );
    placeholderAdProvider.render(slot, spec);
    placeholderAdProvider.render(slot, spec);
    expect(slot.children).toHaveLength(1);
    expect(slot.textContent).toContain("Ad placeholder");
    expect(slot.querySelector(".ptAdPlaceholder")).not.toBeNull();
    expect(slot.querySelector("ins")).toBeNull();
    expect(document.querySelectorAll("script, iframe")).toHaveLength(before);
    expect(fetchSpy).not.toHaveBeenCalled();
    placeholderAdProvider.destroy(slot);
    expect(slot.childNodes).toHaveLength(0);
  });

  it("has no consent message to reopen", () => {
    placeholderAdProvider.openPrivacySettings();
    expect(notice).toHaveBeenCalledOnce();
  });
});
