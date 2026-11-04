// Every user-facing accounts string lives here so Legal can sign off (or
// replace) them in one place (Legal review of PR #28, 2026-11-04). Messages
// never include server text, emails, uids or tokens.

export const accountsCopy = {
  api: {
    network:
      "Couldn't reach PuggieType accounts. Check your connection and try again.",
    turnstileFailed: "The security check didn't pass. Please try again.",
    turnstileUnavailable:
      "The security check isn't available right now. Please try again later.",
    unauthorized: "We couldn't confirm your sign-in. Please sign in again.",
    ageCheckRequired: "Please select your birth year to continue.",
    reauthRequired: "Please confirm it's you and try again",
    noAccount:
      "We couldn't find a PuggieType account for this sign-in. Create one to continue.",
    rateLimited: "Too many attempts, please wait and try again",
    unavailable: "Accounts aren't available right now. Please try again later.",
    badResponse: "Something went wrong. Please try again.",
    failed: (status: number): string =>
      `Something went wrong (error ${status}). Please try again.`,
  },
  firebase: {
    "auth/invalid-credential": "Email or password is incorrect",
    "auth/invalid-email": "Invalid email address",
    "auth/user-disabled":
      "This account can't be used. Contact support@puggietype.com for help.",
    "auth/too-many-requests": "Too many attempts, please wait and try again",
    "auth/popup-closed-by-user":
      "The sign-in window was closed before sign-in finished.",
    "auth/cancelled-popup-request":
      "The sign-in window was closed before sign-in finished.",
    "auth/popup-blocked":
      "Your browser blocked the sign-in window. Allow pop-ups for puggietype.com and try again.",
    "auth/network-request-failed": "Network error, please try again",
    "auth/account-exists-with-different-credential":
      "This email is set up with a different sign-in method. Try signing in another way.",
    "auth/email-already-in-use":
      "We couldn't create an account with that email. If you already have one, sign in or reset your password.",
    "auth/weak-password":
      "Please choose a stronger password (at least 8 characters).",
    "auth/requires-recent-login": "Please confirm it's you and try again",
    "auth/user-mismatch":
      "That's a different account from the one that's signed in.",
    "auth/wrong-password": "Email or password is incorrect",
  } as Partial<Record<string, string>>,
  firebaseFallback: "Something went wrong, please try again",
  notConfigured: "Accounts aren't available yet.",
  sessionExpired: "This sign-in has expired. Please start again.",
  nav: { signIn: "sign in", signedIn: "signed in" },
  turnstile: {
    unconfigured: "Sign-in is not available yet.",
    failed: "The security check couldn't load. Refresh the page and try again.",
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
  tabs: { signIn: "sign in", signUp: "create account" },
  signUp: {
    title: "create account",
    google: "sign up with google",
    submit: "create account",
    success: "Account created",
    // shown under the submit button; the link texts become real links
    legal: {
      beforeTerms: "By creating an account, you agree to our ",
      terms: "Terms",
      termsHref: "/terms",
      beforePrivacy: " and confirm you've read our ",
      privacy: "Privacy Policy",
      privacyHref: "/privacy",
      end: ".",
    },
  },
  age: {
    // neutral on purpose: nothing here may hint at the age cutoff
    birthYear: "birth year",
    birthYearBlank: "select your birth year",
    prompt: "One more step: please select your birth year.",
    continue: "continue",
    cancel: "cancel",
    blocked: "Sorry, we can't create an account for you.",
  },
  reset: {
    link: "forgot password?",
    title: "reset password",
    submit: "send reset link",
    // same text whether or not the account exists
    sent: "If an account uses that email, we've sent it a link to reset the password.",
    back: "back to sign in",
  },
  verify: {
    notice: "Please verify your email: we sent you a link.",
    resend: "resend email",
    resent: "Verification email sent",
    check: "I've verified it",
    stillUnverified: "Your email isn't verified yet",
    verified: "Email verified",
  },
  account: {
    delete: "delete account",
    warning:
      "This permanently deletes your account, your saved scores and your sign-in. It can't be undone.",
    confirmPassword: "Enter your password to confirm it's you.",
    confirmGoogle: "You'll confirm it's you with Google.",
    confirm: "delete my account",
    cancel: "cancel",
    deleted: "Your account was deleted",
    partiallyDeleted:
      "Your account data was deleted, but the sign-in could not be removed. Please contact support.",
  },
  signedIn: {
    title: "signed in",
    signOut: "sign out",
  },
} as const;
