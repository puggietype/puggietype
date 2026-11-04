import { describe, expect, it } from "vitest";

import { accountsCopy } from "../../src/ts/accounts/strings";

// Legal review of PR #28 (2026-11-04), table (a): exact copy
describe("accountsCopy (Legal-approved)", () => {
  it("api messages", () => {
    expect(accountsCopy.api).toMatchObject({
      network:
        "Couldn't reach PuggieType accounts. Check your connection and try again.",
      turnstileFailed: "The security check didn't pass. Please try again.",
      turnstileUnavailable:
        "The security check isn't available right now. Please try again later.",
      unauthorized: "We couldn't confirm your sign-in. Please sign in again.",
      ageCheckRequired: "Please select your birth year to continue.",
      noAccount:
        "We couldn't find a PuggieType account for this sign-in. Create one to continue.",
      unavailable:
        "Accounts aren't available right now. Please try again later.",
      badResponse: "Something went wrong. Please try again.",
    });
    expect(accountsCopy.api.failed(503)).toBe(
      "Something went wrong (error 503). Please try again.",
    );
  });

  it("firebase messages", () => {
    expect(accountsCopy.firebase).toMatchObject({
      "auth/user-disabled":
        "This account can't be used. Contact support@puggietype.com for help.",
      "auth/popup-closed-by-user":
        "The sign-in window was closed before sign-in finished.",
      "auth/cancelled-popup-request":
        "The sign-in window was closed before sign-in finished.",
      "auth/popup-blocked":
        "Your browser blocked the sign-in window. Allow pop-ups for puggietype.com and try again.",
      "auth/account-exists-with-different-credential":
        "This email is set up with a different sign-in method. Try signing in another way.",
      "auth/email-already-in-use":
        "We couldn't create an account with that email. If you already have one, sign in or reset your password.",
      "auth/weak-password":
        "Please choose a stronger password (at least 8 characters).",
      "auth/user-mismatch":
        "That's a different account from the one that's signed in.",
    });
  });

  it("email-already-in-use doesn't say the account exists", () => {
    const text = accountsCopy.firebase["auth/email-already-in-use"] ?? "";
    expect(text).not.toMatch(/already (uses|exists|registered|in use)/i);
  });

  it("other messages", () => {
    expect(accountsCopy.notConfigured).toBe("Accounts aren't available yet.");
    expect(accountsCopy.sessionExpired).toBe(
      "This sign-in has expired. Please start again.",
    );
    expect(accountsCopy.turnstile.failed).toBe(
      "The security check couldn't load. Refresh the page and try again.",
    );
    expect(accountsCopy.account.warning).toBe(
      "This permanently deletes your account, your saved scores and your sign-in. It can't be undone.",
    );
  });

  it("age.blocked is unchanged and stays neutral", () => {
    expect(accountsCopy.age.blocked).toBe(
      "Sorry, we can't create an account for you.",
    );
    for (const text of Object.values(accountsCopy.age)) {
      expect(text).not.toMatch(/\d|\bage\b|old|under|child|young/i);
    }
  });

  it("signUp.legal reads as Legal's sentence", () => {
    const l = accountsCopy.signUp.legal;
    expect(
      `${l.beforeTerms}${l.terms}${l.beforePrivacy}${l.privacy}${l.end}`,
    ).toBe(
      "By creating an account, you agree to our Terms and confirm you've read our Privacy Policy.",
    );
    expect([l.termsHref, l.privacyHref]).toEqual(["/terms", "/privacy"]);
  });
});
