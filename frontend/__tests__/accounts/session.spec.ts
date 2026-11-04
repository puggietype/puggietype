import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signInGoogle: vi.fn(),
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
import {
  firebaseErrorMessage,
  restoreSession,
  signIn,
  signOut,
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
  sdk.signInGoogle.mockResolvedValue(fbUser);
  sdk.getUserIdToken.mockResolvedValue("id-token");
  sdk.signOutFirebase.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setAccountUser(null);
});

describe("accounts session", () => {
  it("email sign-in sends the id and turnstile tokens to the API", async () => {
    api.createSession.mockResolvedValue({ ok: true, user, created: false });
    const result = await signIn(
      { kind: "email", email: "a@b.test", password: "pw" },
      "ts-token",
    );
    expect(result).toEqual({ ok: true, created: false });
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
      ok: true,
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
      ok: false,
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
      ok: false,
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
