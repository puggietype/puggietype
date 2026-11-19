import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/ts/multiplayer/race", () => ({
  setCharacter: vi.fn(),
}));
vi.mock(
  "../../../src/ts/components/pages/test/character-frames",
  async (orig) => ({
    ...(await orig<
      typeof import("../../../src/ts/components/pages/test/character-frames")
    >()),
    loadCharacterSvg: async () => "<svg></svg>",
  }),
);

const { CharacterPicker } =
  await import("../../../src/ts/multiplayer/components/CharacterPicker");
const { CHARACTERS } =
  await import("../../../src/ts/components/pages/test/character-frames");

describe("CharacterPicker", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      () =>
        ({
          matches: false,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("marks the selected dog by ring, scale and a decorative check", () => {
    const { getByTestId, getAllByTestId } = render(() => (
      <CharacterPicker selected="corgie" locked={false} />
    ));
    const card = getByTestId("mp-character-card");
    expect(card.style.getPropertyValue("--dog-pick")).not.toBe("");
    const selected = getByTestId("mp-character-corgie");
    expect(selected).toHaveAttribute("aria-checked", "true");
    expect(selected).toHaveClass(
      "border-2",
      "border-(--dog-pick)",
      "scale-105",
    );
    expect(selected).not.toHaveClass("border-main");
    // hovering the selected dog keeps its ring
    expect(selected.className).not.toMatch(/hover:border-/);
    const checks = getAllByTestId("mp-character-check");
    expect(checks).toHaveLength(1);
    const check = checks[0] as HTMLElement;
    expect(selected).toContainElement(check);
    expect(check).toHaveAttribute("aria-hidden", "true");
    expect(check).toHaveClass("bg-(--dog-pick)", "text-bg");
    expect(check.querySelector("i.fas.fa-check")).not.toBeNull();
    for (const c of CHARACTERS.filter((x) => x !== "corgie")) {
      const other = getByTestId(`mp-character-${c}`);
      expect(other).toHaveAttribute("aria-checked", "false");
      expect(other).toHaveClass("border-transparent", "hover:border-sub");
      expect(other).not.toHaveClass("scale-105");
    }
  });

  it("locked: other dogs dim, the selected ring and check stay", () => {
    const { getByTestId } = render(() => (
      <CharacterPicker selected="puggie" locked={true} />
    ));
    const selected = getByTestId("mp-character-puggie");
    expect(selected).toHaveClass("border-(--dog-pick)", "scale-105");
    expect(selected).not.toHaveClass("opacity-40", "hover:border-transparent");
    expect(selected).toContainElement(getByTestId("mp-character-check"));
    const other = getByTestId("mp-character-huskie");
    expect(other).toHaveClass("opacity-40", "hover:border-transparent");
    expect(other).toHaveAttribute("aria-disabled", "true");
  });

  it("every dog renders in full colour", () => {
    const { getByTestId } = render(() => (
      <CharacterPicker selected="puggie" locked={false} />
    ));
    for (const c of CHARACTERS) {
      const art = getByTestId(`mp-character-${c}`).querySelector(
        "[data-character]",
      );
      expect(art).toHaveClass("dog-color");
    }
  });
});
