import { createSession, SessionUser } from "./api";
import { getAccountsConfig, missingAccountsConfig } from "./config";
import { SESSION_HINT_KEY } from "./flag";
import { setAccountUser } from "./state";

export type SignInMethod =
  | { kind: "email"; email: string; password: string }
  | { kind: "google" };

export type SignInResult = { ok: true } | { ok: false; message: string };

async function loadSdk(): Promise<typeof import("./firebase-sdk")> {
  return import("./firebase-sdk");
}

/** starts fetching the Firebase chunk so the Google popup opens on click */
export function preloadSdk(): void {
  void loadSdk().catch(() => undefined);
}

const FIREBASE_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email or password is incorrect",
  "auth/invalid-email": "Invalid email address",
  "auth/user-disabled": "This account is disabled",
  "auth/too-many-requests": "Too many attempts, please wait and try again",
  "auth/popup-closed-by-user": "Sign-in popup was closed",
  "auth/cancelled-popup-request": "Sign-in popup was closed",
  "auth/popup-blocked":
    "The sign-in popup was blocked, allow popups for this site and try again",
  "auth/network-request-failed": "Network error, please try again",
  "auth/account-exists-with-different-credential":
    "This email already uses a different sign-in method",
};

export function firebaseErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  return FIREBASE_MESSAGES[code] ?? "Sign-in failed, please try again";
}

function setSignedIn(user: SessionUser | null): void {
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
    return { ok: false, message: "Accounts are not configured" };
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
    return { ok: false, message: firebaseErrorMessage(e) };
  }

  const session = await createSession({
    apiUrl: config.apiUrl,
    idToken,
    turnstileToken,
  });
  if (!session.ok) {
    await sdk.signOutFirebase(config.firebase).catch(() => undefined);
    setSignedIn(null);
    return { ok: false, message: session.message };
  }
  setSignedIn(session.user);
  return { ok: true };
}

/** boot: restores a persisted Firebase user (only runs with a session hint) */
export async function restoreSession(): Promise<void> {
  const config = getAccountsConfig();
  if (missingAccountsConfig(config).length > 0) return;
  try {
    const sdk = await loadSdk();
    const user = await sdk.getRestoredUser(config.firebase);
    setSignedIn(
      user === null
        ? null
        : { uid: user.uid, emailVerified: user.emailVerified },
    );
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
