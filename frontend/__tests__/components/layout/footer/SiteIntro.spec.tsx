import { render } from "@solidjs/testing-library";
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

  it("is hidden off the test page and fades out in focus", () => {
    const { container } = render(() => <SiteIntro />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.classList.contains("hidden")).toBe(false);

    setFocus(true);
    expect(wrapper.classList.contains("opacity-0")).toBe(true);

    setPage("settings");
    expect(wrapper.classList.contains("hidden")).toBe(true);
  });

  it("renders nothing without the static intro", () => {
    document.getElementById("siteIntro")?.remove();
    const { container } = render(() => <SiteIntro />);
    expect(container.innerHTML).toBe("");
  });
});
