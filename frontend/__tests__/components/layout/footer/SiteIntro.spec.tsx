import { render } from "@solidjs/testing-library";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const [page, setPage] = createSignal("test");
const [focus, setFocus] = createSignal(false);

vi.mock("../../../../src/ts/states/core", () => ({
  getActivePage: () => page(),
}));
vi.mock("../../../../src/ts/states/test", () => ({
  getFocus: () => focus(),
}));

import { SiteIntro } from "../../../../src/ts/components/layout/footer/SiteIntro";

describe("SiteIntro", () => {
  beforeEach(() => {
    setPage("test");
    setFocus(false);
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<section id="siteIntro" class="preload"><a href="/faq">FAQ</a></section>',
    );
  });
  afterEach(() => {
    document.getElementById("siteIntro")?.remove();
  });

  it("adopts the static intro and drops its preload positioning", () => {
    const { container } = render(() => <SiteIntro />);
    const intro = container.querySelector("#siteIntro");
    expect(intro).not.toBeNull();
    expect(intro?.classList.contains("preload")).toBe(false);
    expect(document.querySelectorAll("#siteIntro")).toHaveLength(1);
  });

  it("is visible on the idle test page", () => {
    const { container } = render(() => <SiteIntro />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.classList.contains("hidden")).toBe(false);
    expect(wrapper.classList.contains("opacity-0")).toBe(false);
    expect(wrapper.style.display).not.toBe("none");
    expect(wrapper.querySelector("#siteIntro")?.classList).not.toContain(
      "hidden",
    );
  });

  it("is hidden off the test page and fades out in focus", () => {
    const { container } = render(() => <SiteIntro />);
    const wrapper = container.firstElementChild as HTMLElement;

    setFocus(true);
    expect(wrapper.classList.contains("opacity-0")).toBe(true);
    setFocus(false);
    expect(wrapper.classList.contains("opacity-0")).toBe(false);

    setPage("settings");
    expect(wrapper.classList.contains("hidden")).toBe(true);
    setPage("test");
    expect(wrapper.classList.contains("hidden")).toBe(false);
  });

  it("renders nothing without the static intro", () => {
    document.getElementById("siteIntro")?.remove();
    const { container } = render(() => <SiteIntro />);
    expect(container.innerHTML).toBe("");
  });

  it("App renders it inside #app, after the page and before the footer", () => {
    // App needs the whole app to mount; the order is read off its source
    const app = readFileSync(
      path.resolve(__dirname, "../../../../src/ts/components/core/App.tsx"),
      "utf-8",
    );
    const at = (needle: string): number => {
      const i = app.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const appStart = at('id="app"');
    const pages = at("<Pages ");
    const mainEnd = at("</main>");
    const intro = at("<SiteIntro />");
    const footer = at("<Footer />");
    expect(app.split("<SiteIntro />")).toHaveLength(2);
    expect(appStart).toBeLessThan(pages);
    expect(pages).toBeLessThan(mainEnd);
    expect(mainEnd).toBeLessThan(intro);
    expect(intro).toBeLessThan(footer);
    // #app closes after the footer
    expect(app.indexOf("</div>", footer)).toBeLessThan(
      app.indexOf("<DevTools />"),
    );
    expect(app.indexOf("<DevTools />")).toBeGreaterThan(footer);
  });
});
