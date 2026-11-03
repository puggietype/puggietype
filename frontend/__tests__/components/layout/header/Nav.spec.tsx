import { render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { standalone } = vi.hoisted(() => ({ standalone: { value: true } }));

vi.mock("../../../../src/ts/utils/env", () => ({
  isStandalone: () => standalone.value,
  isDevEnvironment: () => false,
}));
vi.mock("../../../../src/ts/multiplayer/flags", () => ({
  MULTIPLAYER_ENABLED: true,
}));
vi.mock("../../../../src/ts/states/test", () => ({
  getFocus: () => false,
}));
vi.mock("../../../../src/ts/states/snapshot", () => ({
  getSnapshot: () => undefined,
}));
vi.mock("../../../../src/ts/collections/connections", () => ({
  usePendingConnectionsQuery: () => () => [],
}));
vi.mock("@tanstack/solid-query", () => ({
  useQuery: () => ({ data: undefined }),
}));
vi.mock("../../../../src/ts/queries/server-configuration", () => ({
  getServerConfigurationQueryOptions: () => ({}),
}));
vi.mock("../../../../src/ts/queries/prefetch", () => ({
  prefetchLeaderboardPage: vi.fn(),
}));
vi.mock("../../../../src/ts/components/layout/header/AccountMenu", () => ({
  AccountMenu: () => null,
}));
vi.mock("../../../../src/ts/components/layout/header/AccountXpBar", () => ({
  AccountXpBar: () => null,
}));

import { Nav } from "../../../../src/ts/components/layout/header/Nav";
import { setActivePage } from "../../../../src/ts/states/core";

describe("Nav", () => {
  beforeEach(() => {
    standalone.value = true;
    setActivePage("test");
  });
  afterEach(() => {
    setActivePage("loading");
  });

  const item = (container: HTMLElement, name: string): HTMLElement => {
    const el = container.querySelector<HTMLElement>(
      `[data-nav-item="${name}"]`,
    );
    if (el === null) throw new Error(`no nav item ${name}`);
    return el;
  };

  const classesOf = (el: Element): string[] =>
    (el.getAttribute("class") ?? "").split(/\s+/);

  /** label text visible below sm / from sm up, read off the label classes */
  const visibleLabels = (el: HTMLElement): { small: string; large: string } => {
    const spans = [...el.querySelectorAll(":scope > span")];
    const pick = (hiddenClass: string): string =>
      spans
        .filter((s) => !classesOf(s).includes(hiddenClass))
        .map((s) => s.textContent?.trim())
        .join(" ");
    return { small: pick("hidden"), large: pick("sm:hidden") };
  };

  it("shows icon + visible label for each item, without balloons", () => {
    const { container } = render(() => <Nav />);
    const expected: [string, string, string][] = [
      ["test", "solo", "/"],
      ["race", "multiplayer", "/race"],
      ["about", "guides", "/about"],
      ["settings", "settings", "/settings"],
    ];
    for (const [navItem, label, href] of expected) {
      const el = item(container, navItem);
      expect(el.tagName).toBe("A");
      expect(el.getAttribute("href")).toBe(href);
      expect(visibleLabels(el).large).toBe(label);
      expect(el.getAttribute("aria-label")).toBe(label);
      expect(el.hasAttribute("aria-balloon")).toBe(false);
      expect(el.querySelector("i.fa-fw")).not.toBeNull();
    }
    expect(item(container, "race").dataset["testid"]).toBe("nav-race");
  });

  it("never hides a label on small screens; short labels below sm", () => {
    const expected: [string, string, string][] = [
      ["test", "solo", "solo"],
      ["race", "multi", "multiplayer"],
      ["leaderboards-soon", "ranks", "leaderboard soon"],
      ["about", "guides", "guides"],
      ["settings", "settings", "settings"],
    ];
    const { container } = render(() => <Nav />);
    for (const [navItem, small, large] of expected) {
      const el = item(container, navItem);
      expect(visibleLabels(el)).toEqual({ small, large });
      // stacked icon over label below sm, side by side from sm up
      expect(classesOf(el)).toEqual(
        expect.arrayContaining(["flex-col", "sm:flex-row"]),
      );
    }
  });

  it("with a backend: leaderboard label is never hidden either", () => {
    standalone.value = false;
    const { container } = render(() => <Nav />);
    expect(visibleLabels(item(container, "leaderboards"))).toEqual({
      small: "ranks",
      large: "leaderboard",
    });
  });

  it("marks the active page with aria-current", () => {
    const { container } = render(() => <Nav />);
    expect(item(container, "test").getAttribute("aria-current")).toBe("page");
    expect(item(container, "race").hasAttribute("aria-current")).toBe(false);

    setActivePage("race");
    expect(item(container, "test").hasAttribute("aria-current")).toBe(false);
    expect(item(container, "race").getAttribute("aria-current")).toBe("page");
  });

  it("standalone: leaderboard is a disabled, unfocusable placeholder", () => {
    const { container } = render(() => <Nav />);
    expect(container.querySelector('[data-nav-item="leaderboards"]')).toBe(
      null,
    );
    const el = item(container, "leaderboards-soon");
    expect(el.tagName).toBe("SPAN");
    expect(el.hasAttribute("href")).toBe(false);
    expect(el.hasAttribute("tabindex")).toBe(false);
    expect(el.getAttribute("aria-disabled")).toBe("true");
    expect(el.getAttribute("aria-label")).toBe("leaderboard (coming soon)");
    expect(el.getAttribute("title")).toBe("leaderboard (coming soon)");
    expect(el.textContent).toContain("leaderboard");
    expect(el.textContent).toContain("soon");
  });

  it("with a backend: leaderboard is a link", () => {
    standalone.value = false;
    const { container } = render(() => <Nav />);
    expect(container.querySelector('[data-nav-item="leaderboards-soon"]')).toBe(
      null,
    );
    const el = item(container, "leaderboards");
    expect(el.getAttribute("href")).toBe("/leaderboards");
    expect(el.getAttribute("aria-label")).toBe("leaderboard");
    expect(visibleLabels(el).large).toBe("leaderboard");
  });
});
