import { fireEvent, render } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONSENT_ESSENTIAL_COPY,
  readConsentRecord,
} from "../../../src/ts/analytics/consent";
import { CookiesModal } from "../../../src/ts/components/modals/CookiesModal";
import { setAcceptedCookies } from "../../../src/ts/cookies";
import { hideModal, showModal } from "../../../src/ts/states/modals";

describe("CookiesModal", () => {
  beforeEach(() => {
    localStorage.clear();
    hideModal("Cookies");
    showModal("Cookies");
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.show = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
  });

  function renderModal(): {
    dialog: HTMLDialogElement;
    input: HTMLInputElement;
  } {
    document.getElementById("CookiesModal")?.remove();
    document.querySelectorAll("#words-input").forEach((node) => {
      node.remove();
    });
    const input = document.createElement("input");
    input.id = "words-input";
    document.body.append(input);
    input.focus();
    render(() => <CookiesModal />);
    const dialog = document.getElementById("CookiesModal");
    if (!(dialog instanceof HTMLDialogElement)) {
      throw new Error("CookiesModal dialog missing");
    }
    return { dialog, input };
  }

  it("is a bottom bar, not a full-viewport cover", () => {
    const { dialog } = renderModal();
    const classes = dialog.className.split(/\s+/);
    expect(classes).toContain("bottom-0");
    expect(classes).toContain("w-full");
    expect(classes).toContain("bg-transparent");
    expect(classes).toContain("h-auto");
    expect(classes).not.toContain("h-full");
    expect(classes).not.toContain("top-0");
    expect(classes).not.toContain("bg-[rgba(0,0,0,0.5)]");
    expect(dialog.getAttribute("aria-modal")).toBe("false");
    expect(dialog.getAttribute("aria-labelledby")).toBe("consent-title");
    expect(document.body.hasAttribute("data-consent-banner")).toBe(true);
    expect(document.getElementById("words-input")).toHaveFocus();
  });

  it("presents accept and reject as the same button treatment", () => {
    renderModal();
    const accept = document.getElementById("consent-accept");
    const reject = document.getElementById("consent-reject");
    expect(accept).not.toBeNull();
    expect(reject).not.toBeNull();
    expect(accept?.className).toBe(reject?.className);
    expect(accept?.parentElement).toBe(reject?.parentElement);
    expect(accept?.parentElement?.className).toContain("grid-cols-2");
    const copy = document.getElementById("consent-copy");
    expect(copy?.textContent?.replace(/\s+/g, " ").trim()).toContain(
      CONSENT_ESSENTIAL_COPY,
    );
    expect(copy?.className ?? "").not.toMatch(/truncate/);
  });

  it("Escape inside the banner rejects, closes, and restores focus", () => {
    const { dialog, input } = renderModal();
    const reject = document.getElementById("consent-reject");
    if (!(reject instanceof HTMLButtonElement)) {
      throw new Error("consent controls missing");
    }
    reject.focus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(readConsentRecord()).toEqual({
      security: true,
      analytics: false,
      doNotSellOrShare: true,
    });
    expect(document.activeElement).toBe(input);
  });

  it("Escape still rejects and restores focus when ResizeObserver is unavailable", () => {
    const hadObserver = "ResizeObserver" in globalThis;
    const previous = globalThis.ResizeObserver;
    Reflect.deleteProperty(globalThis, "ResizeObserver");
    try {
      expect(typeof ResizeObserver).toBe("undefined");
      const { dialog, input } = renderModal();
      const reject = document.getElementById("consent-reject");
      if (!(reject instanceof HTMLButtonElement)) {
        throw new Error("consent controls missing");
      }
      expect(document.body.hasAttribute("data-consent-banner")).toBe(true);
      expect(document.activeElement).toBe(input);
      reject.focus();
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(readConsentRecord()).toEqual({
        security: true,
        analytics: false,
        doNotSellOrShare: true,
      });
      expect(document.activeElement).toBe(input);
      localStorage.clear();
      showModal("Cookies");
      input.focus();
      fireEvent.keyDown(input, { key: "Escape" });
      expect(readConsentRecord()?.analytics).toBe(false);
      expect(document.activeElement).toBe(input);
    } finally {
      if (hadObserver) {
        globalThis.ResizeObserver = previous;
      }
    }
  });

  it("describes browser storage without a security checkbox", () => {
    localStorage.setItem("config", JSON.stringify({ mode: "time" }));
    localStorage.setItem("lastSeenVersion", JSON.stringify("keep-me"));
    const cookieBefore = document.cookie;
    renderModal();
    const more = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "more options",
    );
    if (!(more instanceof HTMLButtonElement)) {
      throw new Error("more options missing");
    }
    fireEvent.click(more);
    const note = [...document.querySelectorAll("div")].find(
      (el) =>
        el.querySelector(":scope > .text-sub")?.textContent ===
        "saved in this browser",
    );
    if (!(note instanceof HTMLElement)) {
      throw new Error("storage note missing");
    }
    expect(note.getAttribute("data-consent-note")).toBe(
      "saved in this browser",
    );
    expect(
      note
        .querySelector(".text-text")
        ?.textContent?.replace(/\s+/g, " ")
        .trim(),
    ).toBe(
      "Always on. Your settings and privacy choice are saved in this browser (not cookies). Our host, Cloudflare, processes network data to deliver and protect the site and may set security cookies if its bot protection runs. See Privacy policy.",
    );
    const analytics = [...document.querySelectorAll("label")].find(
      (el) => el.querySelector(".text-sub")?.textContent === "analytics",
    );
    expect(
      analytics
        ?.querySelector(".text-text")
        ?.textContent?.replace(/\s+/g, " ")
        .trim(),
    ).toBe("Google Analytics 4. Uses cookies. Off until you accept.");
    expect(note.querySelector("input")).toBeNull();
    expect(note.querySelector("a")?.getAttribute("href")).toBe("/privacy");
    const boxes = [
      ...document.querySelectorAll("#CookiesModal input[type='checkbox']"),
    ];
    expect(boxes.length).toBe(2);
    expect(
      boxes.every(
        (box) => box instanceof HTMLInputElement && box.tabIndex !== -1,
      ),
    ).toBe(true);
    expect(note.tabIndex).toBe(-1);
    expect(localStorage.getItem("config")).toBe(
      JSON.stringify({ mode: "time" }),
    );
    expect(localStorage.getItem("lastSeenVersion")).toBe(
      JSON.stringify("keep-me"),
    );
    expect(localStorage.getItem("acceptedCookies")).toBeNull();
    expect(document.cookie).toBe(cookieBefore);
  });

  it("Escape from the words input rejects without entering the banner", () => {
    const { input } = renderModal();
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(readConsentRecord()).toEqual({
      security: true,
      analytics: false,
      doNotSellOrShare: true,
    });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(readConsentRecord()?.analytics).toBe(false);
    expect(
      [...document.scripts].some((script) =>
        /googletagmanager|google-analytics/i.test(script.src),
      ),
    ).toBe(false);
  });

  function trackCookieWrites(): string[] {
    const writes: string[] = [];
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "_ga=GA1.1.111.222; _ga_TEST=GS1.1; theme=keep",
    );
    vi.spyOn(document, "cookie", "set").mockImplementation((value) => {
      writes.push(value);
    });
    return writes;
  }

  it("reject after an earlier accept expires GA cookies", () => {
    const writes = trackCookieWrites();
    try {
      setAcceptedCookies({
        security: true,
        analytics: true,
        doNotSellOrShare: false,
      });
      expect(writes).toEqual([]);
      renderModal();
      const reject = document.getElementById("consent-reject");
      if (!(reject instanceof HTMLButtonElement)) {
        throw new Error("reject missing");
      }
      fireEvent.click(reject);
      expect(readConsentRecord()?.analytics).toBe(false);
      expect(
        writes.some(
          (line) => line.startsWith("_ga=") && line.includes("path=/"),
        ),
      ).toBe(true);
      expect(
        writes.some(
          (line) => line.startsWith("_ga_TEST=") && line.includes("path=/"),
        ),
      ).toBe(true);
      expect(writes.join("\n")).not.toMatch(/theme/);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("turning analytics off in privacy settings expires GA cookies", () => {
    const writes = trackCookieWrites();
    try {
      setAcceptedCookies({
        security: true,
        analytics: true,
        doNotSellOrShare: false,
      });
      writes.length = 0;
      renderModal();
      const more = [...document.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "more options",
      );
      if (!(more instanceof HTMLButtonElement)) {
        throw new Error("more options missing");
      }
      fireEvent.click(more);
      const analytics = [...document.querySelectorAll("label")].find(
        (el) => el.querySelector(".text-sub")?.textContent === "analytics",
      );
      const box = analytics?.querySelector("input");
      if (!(box instanceof HTMLInputElement)) {
        throw new Error("analytics checkbox missing");
      }
      expect(box.checked).toBe(true);
      fireEvent.click(box);
      const save = document.getElementById("consent-save");
      if (!(save instanceof HTMLButtonElement)) {
        throw new Error("save missing");
      }
      fireEvent.click(save);
      expect(readConsentRecord()?.analytics).toBe(false);
      expect(
        writes.some(
          (line) => line.startsWith("_ga=") && line.includes("path=/"),
        ),
      ).toBe(true);
      expect(writes.join("\n")).not.toMatch(/theme/);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("does not delete cookies when analytics was never accepted", () => {
    const writes = trackCookieWrites();
    try {
      renderModal();
      const reject = document.getElementById("consent-reject");
      if (!(reject instanceof HTMLButtonElement)) {
        throw new Error("reject missing");
      }
      fireEvent.click(reject);
      expect(readConsentRecord()?.analytics).toBe(false);
      expect(writes).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
