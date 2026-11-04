import type { User } from "firebase/auth";

import { blockAge, isAgeBlocked } from "./age";
import { AccountUser, createSession, deleteMe, getMe } from "./api";
import { getAccountsConfig, missingAccountsConfig } from "./config";
import { SESSION_HINT_KEY } from "./flag";
import { isPasswordOk, WEAK_PASSWORD, weakPasswordMessage } from "./password";
import { setAccountUser } from "./state";
import { accountsCopy } from "./strings";

export type AuthMethod =
  | { kind: "email"; email: string; password: string }
  | { kind: "google" };

/**
 * `needs-age`: Firebase is signed in but the API has no account yet and
 * wants the age answer; finish with completeAgeCheck or cancelAgeCheck.
 */
export type AuthResult =
  | { status: "signed-in"; created: boolean }
  | { status: "needs-age" }
  | { status: "error"; code: string; message: string };

/** AuthResult code after an under-13 answer (the device is then blocked) */
export const AGE_BLOCKED = "age_blocked";

type Sdk = typeof import("./firebase-sdk");

// the signed-in Firebase user waiting on the age question, never persisted
let pendingAge: { user: User; isNew: boolean } | undefined;

async function loadSdk(): Promise<Sdk> {
  return import("./firebase-sdk");
}

/** starts fetching the Firebase chunk so the Google popup opens on click */
export function preloadSdk(): void {
  void loadSdk().catch(() => undefined);
}

function firebaseCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
}

export function firebaseErrorMessage(error: unknown): string {
  return (
    accountsCopy.firebase[firebaseCode(error)] ?? accountsCopy.firebaseFallback
  );
}

function setSignedIn(user: AccountUser | null): void {
  setAccountUser(user);
  if (user === null) localStorage.removeItem(SESSION_HINT_KEY);
  else localStorage.setItem(SESSION_HINT_KEY, "1");
}

function error(code: string, message: string): AuthResult {
  return { status: "error", code, message };
}

/** drops a Firebase session the API didn't accept; `remove` deletes it */
async function discard(sdk: Sdk, user: User, remove: boolean): Promise<void> {
  pendingAge = undefined;
  const config = getAccountsConfig();
  try {
    if (remove) await sdk.deleteFirebaseUser(user);
    else await sdk.signOutFirebase(config.firebase);
  } catch {
    await sdk.signOutFirebase(config.firebase).catch(() => undefined);
  }
  setSignedIn(null);
}

/** under 13: no account; the Firebase user (it has no API account) goes */
async function rejectUnderage(sdk: Sdk, user: User): Promise<AuthResult> {
  blockAge(localStorage);
  await discard(sdk, user, true);
  return error(AGE_BLOCKED, accountsCopy.age.blocked);
}

/**
 * POST /v1/auth/session for a signed-in Firebase user. A refusal drops the
 * Firebase session too (deleting it when this flow just created it), so the
 * two never disagree; age_check_required parks it for the age question.
 */
async function establish(
  sdk: Sdk,
  user: User,
  isNew: boolean,
  turnstileToken: string,
  ageOk?: true,
): Promise<AuthResult> {
  const config = getAccountsConfig();
  let session;
  try {
    session = await createSession({
      apiUrl: config.apiUrl,
      idToken: await sdk.getUserIdToken(user),
      turnstileToken,
      ...(ageOk === true ? { ageOk } : {}),
    });
  } catch (e) {
    await discard(sdk, user, isNew);
    return error("", firebaseErrorMessage(e));
  }
  if (session.ok) {
    pendingAge = undefined;
    setSignedIn(session.user);
    return { status: "signed-in", created: session.created };
  }
  if (session.code === "age_check_required" && ageOk !== true) {
    if (isAgeBlocked(localStorage)) return rejectUnderage(sdk, user);
    pendingAge = { user, isNew };
    return { status: "needs-age" };
  }
  await discard(sdk, user, isNew);
  return error(session.code, session.message);
}

async function firebaseSignIn(
  sdk: Sdk,
  method: AuthMethod,
  create: boolean,
): Promise<{ user: User; isNew: boolean }> {
  const config = getAccountsConfig().firebase;
  if (method.kind === "google") return sdk.signInGoogle(config);
  if (create) {
    const user = await sdk.createUserEmail(
      config,
      method.email,
      method.password,
    );
    return { user, isNew: true };
  }
  const user = await sdk.signInEmail(config, method.email, method.password);
  return { user, isNew: false };
}

async function start(
  method: AuthMethod,
  turnstileToken: string,
  create: boolean,
): Promise<AuthResult> {
  if (missingAccountsConfig(getAccountsConfig()).length > 0) {
    return error("", accountsCopy.notConfigured);
  }
  const sdk = await loadSdk();
  let signedIn;
  try {
    signedIn = await firebaseSignIn(sdk, method, create);
  } catch (e) {
    return error("", firebaseErrorMessage(e));
  }
  const result = await establish(
    sdk,
    signedIn.user,
    signedIn.isNew,
    turnstileToken,
    create ? true : undefined,
  );
  // Google addresses come verified; a new email account gets the link now
  if (result.status === "signed-in" && !signedIn.user.emailVerified) {
    await sdk.sendVerification(signedIn.user).catch(() => undefined);
  }
  return result;
}

/** existing account; a first-time Google user may come back `needs-age` */
export async function signIn(
  method: AuthMethod,
  turnstileToken: string,
): Promise<AuthResult> {
  return start(method, turnstileToken, false);
}

/**
 * New account, after the sign-up form found the user 13+ (only that boolean
 * goes on, as `ageOk: true`). Refuses without touching Firebase on a
 * device that already answered under 13, or with a too-short password.
 */
export async function signUp(
  method: AuthMethod,
  turnstileToken: string,
): Promise<AuthResult> {
  if (isAgeBlocked(localStorage)) {
    return error(AGE_BLOCKED, accountsCopy.age.blocked);
  }
  if (method.kind === "email" && !isPasswordOk(method.password)) {
    return error(WEAK_PASSWORD, weakPasswordMessage());
  }
  return start(method, turnstileToken, true);
}

/** answers the age question a `needs-age` result asked for */
export async function completeAgeCheck(
  ageOk: boolean,
  turnstileToken: string,
): Promise<AuthResult> {
  const pending = pendingAge;
  if (pending === undefined) return error("", accountsCopy.sessionExpired);
  const sdk = await loadSdk();
  if (!ageOk) return rejectUnderage(sdk, pending.user);
  const result = await establish(
    sdk,
    pending.user,
    pending.isNew,
    turnstileToken,
    true,
  );
  if (result.status === "signed-in" && !pending.user.emailVerified) {
    await sdk.sendVerification(pending.user).catch(() => undefined);
  }
  return result;
}

/** backs out of the age question: no account, Firebase signed out */
export async function cancelAgeCheck(): Promise<void> {
  const pending = pendingAge;
  if (pending === undefined) return;
  await discard(await loadSdk(), pending.user, pending.isNew);
}

/**
 * boot (only with a session hint): restores the persisted Firebase user and
 * asks GET /v1/me for the account. A refused token or a missing account
 * signs out; a network or server error keeps the hint for the next boot.
 */
export async function restoreSession(): Promise<void> {
  const config = getAccountsConfig();
  if (missingAccountsConfig(config).length > 0) return;
  try {
    const sdk = await loadSdk();
    const user = await sdk.getRestoredUser(config.firebase);
    if (user === null) {
      setSignedIn(null);
      return;
    }
    const me = await getMe({
      apiUrl: config.apiUrl,
      idToken: await sdk.getUserIdToken(user),
    });
    if (me.ok) {
      setSignedIn(me.user);
    } else if (me.status === 401 || me.status === 404) {
      await sdk.signOutFirebase(config.firebase).catch(() => undefined);
      setSignedIn(null);
    } else {
      setAccountUser(null);
    }
  } catch {
    setSignedIn(null);
  }
}

export async function signOut(): Promise<void> {
  const config = getAccountsConfig();
  try {
    const sdk = await loadSdk();
    await sdk.signOutFirebase(config.firebase);
  } finally {
    setSignedIn(null);
  }
}

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Firebase password reset email. Unknown addresses count as sent, so the
 * form never tells whether an account exists.
 */
export async function requestPasswordReset(
  email: string,
): Promise<ActionResult> {
  const config = getAccountsConfig();
  if (missingAccountsConfig(config).length > 0) {
    return { ok: false, message: accountsCopy.notConfigured };
  }
  try {
    const sdk = await loadSdk();
    await sdk.sendPasswordReset(config.firebase, email);
  } catch (e) {
    const code = firebaseCode(e);
    if (code !== "auth/user-not-found" && code !== "auth/invalid-credential") {
      return { ok: false, message: firebaseErrorMessage(e) };
    }
  }
  return { ok: true };
}

/** sends the verification link again to the signed-in user */
export async function resendVerification(): Promise<ActionResult> {
  try {
    const sdk = await loadSdk();
    const user = await sdk.getRestoredUser(getAccountsConfig().firebase);
    if (user === null) {
      return { ok: false, message: accountsCopy.sessionExpired };
    }
    await sdk.sendVerification(user);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: firebaseErrorMessage(e) };
  }
}

/**
 * After the user clicked the link: reloads the Firebase user, takes a fresh
 * ID token (its email_verified claim) and re-reads the account.
 * @returns whether the email now counts as verified
 */
export async function refreshVerification(): Promise<boolean> {
  const config = getAccountsConfig();
  try {
    const sdk = await loadSdk();
    const user = await sdk.getFreshUser(config.firebase);
    if (user === null) return false;
    const me = await getMe({
      apiUrl: config.apiUrl,
      idToken: await sdk.getUserIdToken(user, true),
    });
    if (!me.ok) return false;
    setSignedIn(me.user);
    return me.user.emailVerified;
  } catch {
    return false;
  }
}

/** "password" or "google" for the signed-in user, null when signed out */
export async function getReauthKind(): Promise<"password" | "google" | null> {
  try {
    const sdk = await loadSdk();
    const user = await sdk.getRestoredUser(getAccountsConfig().firebase);
    return user === null ? null : sdk.reauthKind(user);
  } catch {
    return null;
  }
}

/**
 * Deletes the account: re-auth (password, or a Google popup), DELETE /v1/me
 * with the fresh token, then Firebase deleteUser. Signed out afterwards.
 * The client deleteUser is best-effort: the server removes a leftover
 * Firebase user itself.
 */
export async function deleteAccount(password?: string): Promise<ActionResult> {
  const config = getAccountsConfig();
  const sdk = await loadSdk();
  const user = await sdk.getRestoredUser(config.firebase).catch(() => null);
  if (user === null) return { ok: false, message: accountsCopy.sessionExpired };

  let idToken: string;
  try {
    await sdk.reauthenticate(user, password);
    idToken = await sdk.getUserIdToken(user, true);
  } catch (e) {
    return { ok: false, message: firebaseErrorMessage(e) };
  }

  const deleted = await deleteMe({ apiUrl: config.apiUrl, idToken });
  if (!deleted.ok) return { ok: false, message: deleted.message };

  pendingAge = undefined;
  try {
    await sdk.deleteFirebaseUser(user);
  } catch {
    // the API account is gone already; drop the leftover sign-in at least
    await sdk.signOutFirebase(config.firebase).catch(() => undefined);
    setSignedIn(null);
    return { ok: false, message: accountsCopy.account.partiallyDeleted };
  }
  setSignedIn(null);
  return { ok: true };
}
