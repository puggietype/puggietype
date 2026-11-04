import { describe, expect, it } from "vitest";

import {
  isPasswordOk,
  MIN_PASSWORD_LENGTH,
  weakPasswordMessage,
} from "../../src/ts/accounts/password";
import { accountsCopy } from "../../src/ts/accounts/strings";

describe("accounts password rule", () => {
  it("needs at least 8 characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(isPasswordOk("")).toBe(false);
    expect(isPasswordOk("1234567")).toBe(false);
    expect(isPasswordOk("12345678")).toBe(true);
    expect(isPasswordOk("a much longer passphrase")).toBe(true);
  });

  it("counts characters, not UTF-16 units", () => {
    // 4 emoji are 8 UTF-16 units but only 4 characters
    expect(isPasswordOk("🐶🐶🐶🐶")).toBe(false);
    expect(isPasswordOk("🐶🐶🐶🐶🐶🐶🐶🐶")).toBe(true);
  });

  it("uses the strings weak-password text", () => {
    expect(weakPasswordMessage()).toBe(
      accountsCopy.firebase["auth/weak-password"],
    );
    expect(weakPasswordMessage()).toBe(
      "Please choose a stronger password (at least 8 characters).",
    );
  });
});
