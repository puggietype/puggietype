import type { User } from "firebase/auth";

import { blockAge, isAgeBlocked } from "./age";
import { AccountUser, createSession, getMe } from "./api";
import { getAccountsConfig, missingAccountsConfig } from "./config";
import { SESSION_HINT_KEY } from "./flag";
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

/** AuthResult code after an under-13 answer (this tab is then blocked) */
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

export function firebaseErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  return accountsCopy.firebase[code] ?? accountsCopy.firebaseFallback;
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
  blockAge(sessionStorage);
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
    if (isAgeBlocked(sessionStorage)) return rejectUnderage(sdk, user);
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
  return establish(
    sdk,
    signedIn.user,
    signedIn.isNew,
    turnstileToken,
    create ? true : undefined,
  );
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
 * goes on, as `ageOk: true`). Refuses without touching Firebase in a tab
 * that already answered under 13.
 */
export async function signUp(
  method: AuthMethod,
  turnstileToken: string,
): Promise<AuthResult> {
  if (isAgeBlocked(sessionStorage)) {
    return error(AGE_BLOCKED, accountsCopy.age.blocked);
  }
  return start(method, turnstileToken, true);
}

/** answers the age question a `needs-age` result asked for */
export async function completeAgeCheck(
  ageOk: boolean,
  turnstileToken: string,
): Promise<AuthResult> {
  const pending = pendingAge;
  if (pending === undefined) return error("", accountsCopy.age.expired);
  const sdk = await loadSdk();
  if (!ageOk) return rejectUnderage(sdk, pending.user);
  return establish(sdk, pending.user, pending.isNew, turnstileToken, true);
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
