import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signInGoogle: vi.fn(),
  createUserEmail: vi.fn(),
  deleteFirebaseUser: vi.fn(),
  sendVerification: vi.fn(),
  sendPasswordReset: vi.fn(),
  getFreshUser: vi.fn(),
  getUserIdToken: vi.fn(),
  getRestoredUser: vi.fn(),
  signOutFirebase: vi.fn(),
}));
vi.mock("../../src/ts/accounts/firebase-sdk", () => sdk);

const api = vi.hoisted(() => ({ createSession: vi.fn(), getMe: vi.fn() }));
vi.mock("../../src/ts/accounts/api", () => api);

vi.mock("../../src/ts/accounts/config", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../../src/ts/accounts/config")>();
  return {
    ...real,
    getAccountsConfig: () =>
      real.parseAccountsConfig({
        VITE_ACCOUNTS_API_URL: "https://api.example.test",
        VITE_FIREBASE_API_KEY: "k",
        VITE_FIREBASE_AUTH_DOMAIN: "x.firebaseapp.com",
        VITE_FIREBASE_PROJECT_ID: "x",
        VITE_FIREBASE_APP_ID: "a",
      }),
  };
});

import { SESSION_HINT_KEY } from "../../src/ts/accounts/flag";
import { AGE_BLOCK_KEY } from "../../src/ts/accounts/age";
import {
  AGE_BLOCKED,
  cancelAgeCheck,
  completeAgeCheck,
  firebaseErrorMessage,
  refreshVerification,
  requestPasswordReset,
  resendVerification,
  restoreSession,
  signIn,
  signOut,
  signUp,
} from "../../src/ts/accounts/session";
import { getAccountUser, setAccountUser } from "../../src/ts/accounts/state";
import { accountsCopy } from "../../src/ts/accounts/strings";

const fbUser = { uid: "u1", emailVerified: true };
const user = {
  uid: "u1",
  displayName: "Sleepy Pug 42",
  emailVerified: true,
  ageOk: true,
  lbListed: false,
  verifiedTypist: false,
  status: "active",
  createdAt: "2026-11-04T00:00:00.000Z",
};

beforeEach(() => {
  sdk.signInEmail.mockResolvedValue(fbUser);
  sdk.signInGoogle.mockResolvedValue({ user: fbUser, isNew: false });
  sdk.createUserEmail.mockResolvedValue(fbUser);
  sdk.deleteFirebaseUser.mockResolvedValue(undefined);
  sdk.sendVerification.mockResolvedValue(undefined);
  sdk.sendPasswordReset.mockResolvedValue(undefined);
  sdk.getUserIdToken.mockResolvedValue("id-token");
  sdk.signOutFirebase.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  setAccountUser(null);
});

describe("accounts session", () => {
  it("email sign-in sends the id and turnstile tokens to the API", async () => {
    api.createSession.mockResolvedValue({ ok: true, user, created: false });
    const result = await signIn(
      { kind: "email", email: "a@b.test", password: "pw" },
      "ts-token",
    );
    expect(result).toEqual({ status: "signed-in", created: false });
    expect(sdk.signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "x" }),
      "a@b.test",
      "pw",
    );
    expect(api.createSession).toHaveBeenCalledWith({
      apiUrl: "https://api.example.test",
      idToken: "id-token",
      turnstileToken: "ts-token",
    });
    expect(getAccountUser()).toEqual(user);
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe("1");
  });

  it("google sign-in uses the popup", async () => {
    api.createSession.mockResolvedValue({ ok: true, user, created: true });
    expect(await signIn({ kind: "google" }, "t")).toEqual({
      status: "signed-in",
      created: true,
    });
    expect(sdk.signInGoogle).toHaveBeenCalledTimes(1);
  });

  it("API refusal signs out of Firebase and leaves no session", async () => {
    api.createSession.mockResolvedValue({
      ok: false,
      status: 403,
      code: "turnstile_failed",
      message: "The bot check failed, please try again",
    });
    const result = await signIn({ kind: "google" }, "t");
    expect(result).toEqual({
      status: "error",
      code: "turnstile_failed",
      message: "The bot check failed, please try again",
    });
    expect(sdk.signOutFirebase).toHaveBeenCalledTimes(1);
    expect(getAccountUser()).toBeNull();
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
  });

  it("Firebase errors never reach the API", async () => {
    sdk.signInEmail.mockRejectedValue({ code: "auth/invalid-credential" });
    const result = await signIn(
      { kind: "email", email: "a@b.test", password: "x" },
      "t",
    );
    expect(result).toEqual({
      status: "error",
      code: "",
      message: "Email or password is incorrect",
    });
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it("maps unknown Firebase errors to a generic message", () => {
    expect(firebaseErrorMessage({ code: "auth/weird" })).toBe(
      accountsCopy.firebaseFallback,
    );
    expect(firebaseErrorMessage(new Error("x"))).toBe(
      accountsCopy.firebaseFallback,
    );
  });

  it("restore asks GET /v1/me with the restored user's token", async () => {
    localStorage.setItem(SESSION_HINT_KEY, "1");
    sdk.getRestoredUser.mockResolvedValue({ ...fbUser, extra: 1 });
    api.getMe.mockResolvedValue({ ok: true, user });
    await restoreSession();
    expect(api.getMe).toHaveBeenCalledWith({
      apiUrl: "https://api.example.test",
      idToken: "id-token",
    });
    expect(getAccountUser()).toEqual(user);
  });

  it("restore clears a stale hint when Firebase has no user", async () => {
    localStorage.setItem(SESSION_HINT_KEY, "1");
    sdk.getRestoredUser.mockResolvedValue(null);
    await restoreSession();
    expect(api.getMe).not.toHaveBeenCalled();
    expect(getAccountUser()).toBeNull();
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
  });

  it.each([401, 404])("restore signs out on %i", async (status) => {
    localStorage.setItem(SESSION_HINT_KEY, "1");
    sdk.getRestoredUser.mockResolvedValue(fbUser);
    api.getMe.mockResolvedValue({ ok: false, status, code: "", message: "" });
    await restoreSession();
    expect(sdk.signOutFirebase).toHaveBeenCalledTimes(1);
    expect(getAccountUser()).toBeNull();
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
  });

  it.each([0, 503])("restore keeps the hint on %i", async (status) => {
    localStorage.setItem(SESSION_HINT_KEY, "1");
    sdk.getRestoredUser.mockResolvedValue(fbUser);
    api.getMe.mockResolvedValue({ ok: false, status, code: "", message: "" });
    await restoreSession();
    expect(sdk.signOutFirebase).not.toHaveBeenCalled();
    expect(getAccountUser()).toBeNull();
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe("1");
  });

  it("sign-out clears state even if Firebase throws", async () => {
    setAccountUser(user);
    localStorage.setItem(SESSION_HINT_KEY, "1");
    sdk.signOutFirebase.mockRejectedValue(new Error("offline"));
    await expect(signOut()).rejects.toThrow("offline");
    expect(getAccountUser()).toBeNull();
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
  });
});

const refusal = (
  code: string,
  status = 403,
): { ok: false; status: number; code: string; message: string } => ({
  ok: false,
  status,
  code,
  message: `m:${code}`,
});
const lastSessionCall = (): Record<string, unknown> =>
  api.createSession.mock.calls.at(-1)?.[0] as Record<string, unknown>;

describe("accounts sign-up and age check", () => {
  const email = { kind: "email", email: "a@b.test", password: "pw" } as const;

  it("email sign-up creates the Firebase user and sends ageOk: true", async () => {
    api.createSession.mockResolvedValue({ ok: true, user, created: true });
    expect(await signUp(email, "t")).toEqual({
      status: "signed-in",
      created: true,
    });
    expect(sdk.createUserEmail).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "x" }),
      "a@b.test",
      "pw",
    );
    expect(sdk.signInEmail).not.toHaveBeenCalled();
    expect(lastSessionCall()).toEqual({
      apiUrl: "https://api.example.test",
      idToken: "id-token",
      turnstileToken: "t",
      ageOk: true,
    });
  });

  it("sign-up refused by the API deletes the just-created Firebase user", async () => {
    api.createSession.mockResolvedValue(refusal("turnstile_failed"));
    const result = await signUp(email, "t");
    expect(result).toMatchObject({ status: "error", code: "turnstile_failed" });
    expect(sdk.deleteFirebaseUser).toHaveBeenCalledWith(fbUser);
    expect(getAccountUser()).toBeNull();
  });

  it("a failed delete still signs out", async () => {
    api.createSession.mockResolvedValue(refusal("turnstile_failed"));
    sdk.deleteFirebaseUser.mockRejectedValue({ code: "x" });
    await signUp(email, "t");
    expect(sdk.signOutFirebase).toHaveBeenCalledTimes(1);
  });

  it("sign-up in a blocked tab never reaches Firebase", async () => {
    sessionStorage.setItem(AGE_BLOCK_KEY, "1");
    expect(await signUp({ kind: "google" }, "t")).toMatchObject({
      status: "error",
      code: AGE_BLOCKED,
    });
    expect(sdk.signInGoogle).not.toHaveBeenCalled();
    expect(sdk.createUserEmail).not.toHaveBeenCalled();
  });

  it("first Google sign-in: age_check_required asks, then retries", async () => {
    sdk.signInGoogle.mockResolvedValue({ user: fbUser, isNew: true });
    api.createSession.mockResolvedValueOnce(refusal("age_check_required"));
    expect(await signIn({ kind: "google" }, "t1")).toEqual({
      status: "needs-age",
    });
    expect(lastSessionCall()).not.toHaveProperty("ageOk");
    // Firebase stays signed in while the question is open
    expect(sdk.signOutFirebase).not.toHaveBeenCalled();
    expect(sdk.deleteFirebaseUser).not.toHaveBeenCalled();

    api.createSession.mockResolvedValueOnce({ ok: true, user, created: true });
    expect(await completeAgeCheck(true, "t2")).toEqual({
      status: "signed-in",
      created: true,
    });
    expect(lastSessionCall()).toMatchObject({
      turnstileToken: "t2",
      ageOk: true,
    });
    expect(getAccountUser()).toEqual(user);
  });

  it("under 13 at the age question: Firebase user deleted, tab blocked", async () => {
    sdk.signInGoogle.mockResolvedValue({ user: fbUser, isNew: true });
    api.createSession.mockResolvedValueOnce(refusal("age_check_required"));
    await signIn({ kind: "google" }, "t1");

    expect(await completeAgeCheck(false, "t2")).toMatchObject({
      status: "error",
      code: AGE_BLOCKED,
    });
    expect(api.createSession).toHaveBeenCalledTimes(1);
    expect(sdk.deleteFirebaseUser).toHaveBeenCalledWith(fbUser);
    expect(sessionStorage.getItem(AGE_BLOCK_KEY)).toBe("1");
    expect(getAccountUser()).toBeNull();
    // nothing left pending
    expect(await completeAgeCheck(true, "t3")).toMatchObject({
      status: "error",
    });
    expect(api.createSession).toHaveBeenCalledTimes(1);
  });

  it("age_check_required in a blocked tab is refused at once", async () => {
    sessionStorage.setItem(AGE_BLOCK_KEY, "1");
    api.createSession.mockResolvedValueOnce(refusal("age_check_required"));
    expect(await signIn({ kind: "google" }, "t")).toMatchObject({
      status: "error",
      code: AGE_BLOCKED,
    });
    expect(sdk.deleteFirebaseUser).toHaveBeenCalledWith(fbUser);
  });

  it("cancel deletes a just-created user, else only signs out", async () => {
    api.createSession.mockResolvedValue(refusal("age_check_required"));
    sdk.signInGoogle.mockResolvedValue({ user: fbUser, isNew: true });
    await signIn({ kind: "google" }, "t");
    await cancelAgeCheck();
    expect(sdk.deleteFirebaseUser).toHaveBeenCalledTimes(1);

    sdk.signInGoogle.mockResolvedValue({ user: fbUser, isNew: false });
    await signIn({ kind: "google" }, "t");
    await cancelAgeCheck();
    expect(sdk.deleteFirebaseUser).toHaveBeenCalledTimes(1);
    expect(sdk.signOutFirebase).toHaveBeenCalledTimes(1);
  });
});

describe("accounts email verification and password reset", () => {
  const unverified = { uid: "u1", emailVerified: false };

  it("a new email account gets the verification link", async () => {
    sdk.createUserEmail.mockResolvedValue(unverified);
    api.createSession.mockResolvedValue({ ok: true, user, created: true });
    await signUp({ kind: "email", email: "a@b.test", password: "pw" }, "t");
    expect(sdk.sendVerification).toHaveBeenCalledWith(unverified);
  });

  it("no link when sign-up fails or the address is already verified", async () => {
    sdk.createUserEmail.mockResolvedValue(unverified);
    api.createSession.mockResolvedValue({
      ok: false,
      status: 403,
      code: "turnstile_failed",
      message: "",
    });
    await signUp({ kind: "email", email: "a@b.test", password: "pw" }, "t");
    api.createSession.mockResolvedValue({ ok: true, user, created: true });
    await signUp({ kind: "google" }, "t");
    expect(sdk.sendVerification).not.toHaveBeenCalled();
  });

  it("a failed send doesn't fail the sign-up", async () => {
    sdk.createUserEmail.mockResolvedValue(unverified);
    sdk.sendVerification.mockRejectedValue({ code: "auth/too-many-requests" });
    api.createSession.mockResolvedValue({ ok: true, user, created: true });
    expect(
      await signUp({ kind: "email", email: "a@b.test", password: "pw" }, "t"),
    ).toMatchObject({ status: "signed-in" });
  });

  it("resend goes to the restored user", async () => {
    sdk.getRestoredUser.mockResolvedValue(unverified);
    expect(await resendVerification()).toEqual({ ok: true });
    expect(sdk.sendVerification).toHaveBeenCalledWith(unverified);

    sdk.sendVerification.mockRejectedValue({ code: "auth/too-many-requests" });
    expect(await resendVerification()).toEqual({
      ok: false,
      message: accountsCopy.firebase["auth/too-many-requests"],
    });

    sdk.getRestoredUser.mockResolvedValue(null);
    expect(await resendVerification()).toEqual({
      ok: false,
      message: accountsCopy.sessionExpired,
    });
  });

  it("refresh reloads, forces a new token and re-reads the account", async () => {
    sdk.getFreshUser.mockResolvedValue({ uid: "u1", emailVerified: true });
    api.getMe.mockResolvedValue({ ok: true, user });
    expect(await refreshVerification()).toBe(true);
    expect(sdk.getUserIdToken).toHaveBeenCalledWith(
      { uid: "u1", emailVerified: true },
      true,
    );
    expect(getAccountUser()).toEqual(user);

    api.getMe.mockResolvedValue({
      ok: true,
      user: { ...user, emailVerified: false },
    });
    expect(await refreshVerification()).toBe(false);
  });

  it("password reset reads the same whether or not the account exists", async () => {
    expect(await requestPasswordReset("a@b.test")).toEqual({ ok: true });
    expect(sdk.sendPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "x" }),
      "a@b.test",
    );
    sdk.sendPasswordReset.mockRejectedValue({ code: "auth/user-not-found" });
    expect(await requestPasswordReset("x@b.test")).toEqual({ ok: true });
    sdk.sendPasswordReset.mockRejectedValue({ code: "auth/invalid-email" });
    expect(await requestPasswordReset("nope")).toEqual({
      ok: false,
      message: accountsCopy.firebase["auth/invalid-email"],
    });
  });
});
