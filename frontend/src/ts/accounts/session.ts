import { AccountUser, createSession, getMe } from "./api";
import { getAccountsConfig, missingAccountsConfig } from "./config";
import { SESSION_HINT_KEY } from "./flag";
import { setAccountUser } from "./state";
import { accountsCopy } from "./strings";

export type SignInMethod =
  | { kind: "email"; email: string; password: string }
  | { kind: "google" };

export type SignInResult =
  | { ok: true; created: boolean }
  | { ok: false; code: string; message: string };

async function loadSdk(): Promise<typeof import("./firebase-sdk")> {
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

/**
 * Firebase sign-in, then POST /v1/auth/session. If the API refuses, the
 * Firebase session is dropped too so the two never disagree.
 */
export async function signIn(
  method: SignInMethod,
  turnstileToken: string,
): Promise<SignInResult> {
  const config = getAccountsConfig();
  if (missingAccountsConfig(config).length > 0) {
    return { ok: false, code: "", message: accountsCopy.notConfigured };
  }
  const sdk = await loadSdk();

  let idToken: string;
  try {
    const user =
      method.kind === "email"
        ? await sdk.signInEmail(config.firebase, method.email, method.password)
        : await sdk.signInGoogle(config.firebase);
    idToken = await sdk.getUserIdToken(user);
  } catch (e) {
    return { ok: false, code: "", message: firebaseErrorMessage(e) };
  }

  const session = await createSession({
    apiUrl: config.apiUrl,
    idToken,
    turnstileToken,
  });
  if (!session.ok) {
    await sdk.signOutFirebase(config.firebase).catch(() => undefined);
    setSignedIn(null);
    return { ok: false, code: session.code, message: session.message };
  }
  setSignedIn(session.user);
  return { ok: true, created: session.created };
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
