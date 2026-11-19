import { describe, expect, it } from "vitest";

import { MIN_PASSWORD_LENGTH } from "../../src/ts/accounts/password";
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
        "Please choose a password with at least 8 characters.",
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
  });

  it("partiallyDeleted asks nothing of the user", () => {
    expect(accountsCopy.account.partiallyDeleted).toBe(
      "Your account and saved data have been deleted. We couldn't finish removing your sign-in details just now, so we'll remove them automatically within 30 days. You don't need to do anything. Questions? Email support@puggietype.com.",
    );
  });

  it("age.blocked is unchanged and stays neutral", () => {
    expect(accountsCopy.age.blocked).toBe(
      "Sorry, we can't create an account for you.",
    );
    for (const text of allStrings(accountsCopy.age)) {
      expect(text).not.toMatch(/\d|\bage\b|old|under|child|young/i);
    }
  });

  it("signUp.legal reads as Legal's sentence", () => {
    const l = accountsCopy.signUp.legal;
    expect(
      `${l.beforeTerms}${l.terms}${l.beforePrivacy}${l.privacy}${l.end}`,
    ).toBe(
      "By creating an account (with email or Google), you agree to our Terms and confirm you've read our Privacy Policy.",
    );
    expect([l.termsHref, l.privacyHref]).toEqual(["/terms", "/privacy"]);
  });
});

// Legal & Trust review of accounts part 1 (2026-11-19), table 1b: exact copy
describe("accountsCopy (Legal 2026-11-19, C1-C18)", () => {
  it("C1 confirm it's you", () => {
    const text = "Please confirm it's you and try again.";
    expect(accountsCopy.api.reauthRequired).toBe(text);
    expect(accountsCopy.firebase["auth/requires-recent-login"]).toBe(text);
  });

  it("C2 too many attempts", () => {
    const text = "Too many attempts. Please wait a bit and try again.";
    expect(accountsCopy.api.rateLimited).toBe(text);
    expect(accountsCopy.firebase["auth/too-many-requests"]).toBe(text);
  });

  it("C3 weak password", () => {
    expect(accountsCopy.firebase["auth/weak-password"]).toBe(
      "Please choose a password with at least 8 characters.",
    );
  });

  it("C4 settings too large", () => {
    expect(accountsCopy.api.tooLarge).toBe(
      "Your settings are too large to save to your account. They stay saved on this device.",
    );
  });

  it("C6 age prompt legal notice", () => {
    const l = accountsCopy.age.legalNotice;
    expect(
      `${l.beforeTerms}${l.terms}${l.beforePrivacy}${l.privacy}${l.end}`,
    ).toBe(
      "By continuing, you agree to our Terms and confirm you've read our Privacy Policy.",
    );
    expect([l.termsHref, l.privacyHref]).toEqual(["/terms", "/privacy"]);
  });

  it("C7 Turnstile notice", () => {
    const n = accountsCopy.turnstile.notice;
    expect(`${n.text}${n.privacy}`).toBe(
      "This form uses Cloudflare Turnstile to check that you're not a bot. It reads signals such as your IP address and browser details. Privacy Policy",
    );
    expect(n.privacyHref).toBe("/privacy#accounts-ages-13");
  });

  it("C8 reset sent", () => {
    expect(accountsCopy.reset.sent).toBe(
      "If an account uses that email, we've sent it a link to reset the password. If you don't see it, check your spam folder. The link works once and expires soon.",
    );
  });

  it("C9 verify notice", () => {
    expect(accountsCopy.verify.notice).toBe(
      "Please verify your email address. We sent you a link. We use your email only for account emails like this one and to contact you about your account.",
    );
  });

  it("C10 recover done", () => {
    expect(accountsCopy.action.recoverDone).toBe(
      "Your sign-in email has been changed back. If you didn't ask for the change, someone else may have had access to your account, so reset your password now.",
    );
  });

  it("C11 C12 export description and done", () => {
    expect(accountsCopy.exportData.description).toBe(
      "Download a copy of the data we hold for your account: your account details and sign-in email, settings and personal bests, as a JSON file. It also has lists for recent results and flagged runs, which are empty because we don't record those yet. The file isn't password protected, so keep it somewhere private.",
    );
    expect(accountsCopy.exportData.done).toBe("Your data was downloaded.");
  });

  it("C13 C14 C15 delete account", () => {
    expect(accountsCopy.account.warning).toBe(
      "This permanently deletes your account, your saved settings and personal bests, and your sign-in. It can't be undone. Data stored on this device, and scores you've already submitted to the public leaderboards under a random nickname, aren't affected.",
    );
    expect(accountsCopy.account.deleted).toBe(
      "Your account and saved data were deleted.",
    );
  });

  it("C16 sync note", () => {
    expect(accountsCopy.signedIn.syncNote).toBe(
      "While you're signed in, your settings are saved to your account and sync to your other devices, and new personal bests are saved too. Sign out to stop syncing; delete your account to remove what we saved.",
    );
  });

  it("C17 personal bests note", () => {
    expect(accountsCopy.personalBests.note).toBe(
      "Personal bests are saved from your browser and aren't verified. Only you can see them here, and they aren't used for leaderboards.",
    );
  });

  it("C18 signed-in footer", () => {
    const f = accountsCopy.signedIn.footer;
    expect(
      `${f.before}${f.privacy}${f.separator}${f.terms}${f.separator}${f.email}`,
    ).toBe("Your data: Privacy Policy · Terms · support@puggietype.com");
    expect([f.privacyHref, f.termsHref, f.emailHref]).toEqual([
      "/privacy",
      "/terms",
      "mailto:support@puggietype.com",
    ]);
  });
});

function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(allStrings);
}

describe("accountsCopy (drafts)", () => {
  it("no em or en dashes anywhere", () => {
    for (const text of allStrings(accountsCopy)) {
      expect(text).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it("every password rule says the same minimum", () => {
    const rule = `at least ${MIN_PASSWORD_LENGTH} characters`;
    expect(accountsCopy.firebase["auth/weak-password"]).toContain(rule);
    expect(accountsCopy.action.passwordRule).toContain(rule);
    const lengths = allStrings(accountsCopy)
      .flatMap((t) => [...t.matchAll(/(\d+) characters/g)])
      .map((m) => Number(m[1]));
    expect(new Set(lengths)).toEqual(new Set([MIN_PASSWORD_LENGTH]));
  });
});
