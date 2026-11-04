// PLACEHOLDER COPY, pending Legal review: every user-facing accounts string
// lives here so Legal can sign off (or replace) them in one place. Messages
// never include server text, emails, uids or tokens.

export const accountsCopy = {
  api: {
    network: "Could not reach the accounts service",
    turnstileFailed: "The bot check failed, please try again",
    turnstileUnavailable:
      "The bot check is unavailable right now, please try again later",
    unauthorized: "Sign-in could not be verified",
    ageCheckRequired: "Please answer the birth year question to continue",
    reauthRequired: "Please confirm it's you and try again",
    noAccount: "No account found, please sign up first",
    rateLimited: "Too many attempts, please wait and try again",
    unavailable: "Accounts are unavailable right now",
    badResponse: "Unexpected response from the accounts service",
    failed: (status: number): string => `Request failed (${status})`,
  },
  firebase: {
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
    "auth/email-already-in-use":
      "This email can't be used to sign up, try signing in instead",
    "auth/weak-password": "Please choose a stronger password",
    "auth/requires-recent-login": "Please confirm it's you and try again",
    "auth/user-mismatch": "That's a different account than the signed-in one",
    "auth/wrong-password": "Email or password is incorrect",
  } as Partial<Record<string, string>>,
  firebaseFallback: "Something went wrong, please try again",
  notConfigured: "Accounts are not configured",
  nav: { signIn: "sign in", signedIn: "signed in" },
  turnstile: {
    unconfigured: "Sign-in is not available yet.",
    failed: "The bot check could not load. Refresh the page and try again.",
  },
  signIn: {
    title: "sign in",
    google: "google",
    or: "or",
    email: "email",
    password: "password",
    submit: "sign in",
    success: "Signed in",
  },
  signedIn: {
    title: "signed in",
    notVerified: "Your email is not verified yet.",
    signOut: "sign out",
  },
} as const;
