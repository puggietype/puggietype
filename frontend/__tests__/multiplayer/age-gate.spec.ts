import { beforeEach, describe, expect, it } from "vitest";

import {
  ageConfirmed,
  confirmAge,
  isAgeConfirmed,
} from "../../src/ts/multiplayer/age-gate";

describe("age gate", () => {
  beforeEach(() => localStorage.clear());

  it("is unconfirmed on a first visit", () => {
    expect(isAgeConfirmed()).toBe(false);
  });

  it("remembers the confirmation in localStorage", () => {
    confirmAge();
    expect(isAgeConfirmed()).toBe(true);
    expect(ageConfirmed()).toBe(true);
    expect(localStorage.getItem("puggie-mp-age-confirmed")).toBe("true");
  });

  it("ignores any other stored value", () => {
    localStorage.setItem("puggie-mp-age-confirmed", "yes");
    expect(isAgeConfirmed()).toBe(false);
  });
});
