import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONSENT_ESSENTIAL_COPY,
  readConsentRecord,
} from "../../src/ts/analytics/consent";

function gaScripts(): HTMLScriptElement[] {
  return [...document.scripts].filter((script) =>
    /googletagmanager|google-analytics/i.test(script.src),
  );
}

async function bootAt(pathname: string, referrer = ""): Promise<void> {
  vi.resetModules();
  window.history.pushState({}, "", pathname);
  if (window.location.pathname !== pathname) {
    throw new Error(`location.pathname=${window.location.pathname}`);
  }
  Object.defineProperty(document, "referrer", {
    configurable: true,
    get: () => referrer,
  });
  document.body.replaceChildren();
  const button = document.createElement("button");
  button.type = "button";
  button.dataset["consentSettings"] = "";
  button.textContent = "Privacy and cookie settings";
  document.body.append(button);
  await import("../../src/ts/analytics/static-boot");
}

describe("static consent banner", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = "";
  });

  it("focuses the banner, gives reject the same button, and does not load GA", async () => {
    await bootAt("/privacy");
    const banner = document.getElementById("pt-consent-banner");
    const actions = banner?.querySelector(".consentActions");
    const buttons = actions?.querySelectorAll("button");
    expect(banner?.getAttribute("role")).toBe("dialog");
    expect(banner?.getAttribute("aria-modal")).toBe("false");
    expect(buttons).toHaveLength(2);
    expect(buttons?.[0]?.textContent).toBe("Accept analytics");
    expect(buttons?.[1]?.textContent).toBe("Reject analytics");
    expect(buttons?.[0]?.className).toBe(buttons?.[1]?.className);
    expect(
      document
        .getElementById("pt-consent-copy")
        ?.textContent?.replace(/\s+/g, " ")
        .trim(),
    ).toContain(CONSENT_ESSENTIAL_COPY);
    expect(document.activeElement).toBe(banner);
    expect(document.activeElement).not.toBe(buttons?.[0]);
    expect(gaScripts()).toEqual([]);
    expect(readConsentRecord()).toBeNull();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });

  it("Escape rejects without loading GA and restores focus to the opener", async () => {
    localStorage.setItem(
      "acceptedCookies",
      JSON.stringify({
        security: true,
        analytics: false,
        doNotSellOrShare: true,
      }),
    );
    await bootAt("/privacy");
    expect(document.getElementById("pt-consent-banner")).toBeNull();
    const opener = document.body.querySelector("button");
    if (opener === null) {
      throw new Error(
        `settings button missing html=${document.body.innerHTML}`,
      );
    }
    const prior = document.createElement("input");
    document.body.append(prior);
    prior.focus();
    expect(document.activeElement).toBe(prior);
    opener.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.getElementById("pt-consent-banner")).not.toBeNull();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(document.getElementById("pt-consent-banner")).toBeNull();
    expect(readConsentRecord()).toEqual({
      security: true,
      analytics: false,
      doNotSellOrShare: true,
    });
    expect(document.activeElement).toBe(prior);
    expect(gaScripts()).toEqual([]);
  });

  it("does not show a banner or GA on a kids path, including a later same-tab page", async () => {
    await bootAt("/guide/typing-for-kids");
    expect(sessionStorage.getItem("puggie-kids-flow")).toBe("1");
    expect(document.getElementById("pt-consent-banner")).toBeNull();

    await bootAt("/privacy");
    expect(document.getElementById("pt-consent-banner")).toBeNull();
    expect(gaScripts()).toEqual([]);
  });

  it("treats a new tab without the kids referrer as a normal page", async () => {
    await bootAt("/", "https://puggietype.com/guide/teaching-kids-to-type/");
    expect(sessionStorage.getItem("puggie-kids-flow")).toBe("1");
    expect(document.getElementById("pt-consent-banner")).toBeNull();

    sessionStorage.clear();
    await bootAt("/privacy", "");
    expect(sessionStorage.getItem("puggie-kids-flow")).toBeNull();
    expect(document.getElementById("pt-consent-banner")).not.toBeNull();
    expect(readConsentRecord()).toBeNull();
  });

  function clickLabeled(label: string): void {
    const button = [...document.querySelectorAll("button")].find(
      (node) => node.textContent === label,
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`${label} missing`);
    }
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  it("reject after accept expires GA cookies and the next load stays off", async () => {
    const writes: string[] = [];
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "_ga=GA1.1.111.222; _ga_TEST=GS1.1; theme=keep",
    );
    vi.spyOn(document, "cookie", "set").mockImplementation((value) => {
      writes.push(value);
    });
    try {
      await bootAt("/privacy");
      clickLabeled("Accept analytics");
      expect(readConsentRecord()?.analytics).toBe(true);
      expect(writes).toEqual([]);
      clickLabeled("Privacy and cookie settings");
      clickLabeled("Reject analytics");
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
      for (const script of gaScripts()) script.remove();
      await bootAt("/faq");
      expect(gaScripts()).toEqual([]);
      expect(readConsentRecord()?.analytics).toBe(false);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("does not delete cookies when analytics was never accepted", async () => {
    const writes: string[] = [];
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "_ga=GA1.1.111.222; theme=keep",
    );
    vi.spyOn(document, "cookie", "set").mockImplementation((value) => {
      writes.push(value);
    });
    try {
      await bootAt("/privacy");
      clickLabeled("Reject analytics");
      expect(readConsentRecord()?.analytics).toBe(false);
      expect(writes).toEqual([]);
      expect(gaScripts()).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
