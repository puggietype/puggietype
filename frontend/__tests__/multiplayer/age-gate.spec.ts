import { beforeEach, describe, expect, it, vi } from "vitest";

/** a fresh module per test: confirmation is also kept in memory per page load */
async function load(): Promise<
  typeof import("../../src/ts/multiplayer/age-gate")
> {
  vi.resetModules();
  return import("../../src/ts/multiplayer/age-gate");
}

describe("age gate", () => {
  beforeEach(() => localStorage.clear());

  it("is unconfirmed on a first visit", async () => {
    const { isAgeConfirmed } = await load();
    expect(isAgeConfirmed()).toBe(false);
  });

  it("remembers the confirmation in localStorage", async () => {
    const { ageConfirmed, confirmAge, isAgeConfirmed } = await load();
    confirmAge();
    expect(isAgeConfirmed()).toBe(true);
    expect(ageConfirmed()).toBe(true);
    expect(localStorage.getItem("puggie-mp-age-confirmed")).toBe("true");
    expect((await load()).isAgeConfirmed()).toBe(true);
  });

  it("ignores any other stored value", async () => {
    localStorage.setItem("puggie-mp-age-confirmed", "yes");
    const { isAgeConfirmed } = await load();
    expect(isAgeConfirmed()).toBe(false);
  });

  it("stays confirmed for the page load when storage is blocked", async () => {
    const { confirmAge, isAgeConfirmed } = await load();
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    confirmAge();
    setItem.mockRestore();
    expect(isAgeConfirmed()).toBe(true);
  });
});
