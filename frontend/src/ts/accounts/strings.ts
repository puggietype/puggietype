// Every user-facing accounts string lives here so Legal can sign off (or
// replace) them in one place (Legal reviews of PR #28, 2026-11-04, and
// accounts part 1, 2026-11-19). Messages never include server text, emails,
// uids or tokens.

export const accountsCopy = {
  api: {
    network:
      "Couldn't reach PuggieType accounts. Check your connection and try again.",
    turnstileFailed: "The security check didn't pass. Please try again.",
    turnstileUnavailable:
      "The security check isn't available right now. Please try again later.",
    unauthorized: "We couldn't confirm your sign-in. Please sign in again.",
    ageCheckRequired: "Please select your birth year to continue.",
    reauthRequired: "Please confirm it's you and try again.",
    noAccount:
      "We couldn't find a PuggieType account for this sign-in. Create one to continue.",
    rateLimited: "Too many attempts. Please wait a bit and try again.",
    unavailable: "Accounts aren't available right now. Please try again later.",
    badResponse: "Something went wrong. Please try again.",
    // settings sync, personal bests, export: Legal review 2026-11-19 (accounts-p1, 1b)
    invalidPb: "That result couldn't be saved as a personal best.",
    pbLimit: "You've reached the limit of saved personal bests.",
    tooLarge:
      "Your settings are too large to save to your account. They stay saved on this device.",
    failed: (status: number): string =>
      `Something went wrong (error ${status}). Please try again.`,
  },
  firebase: {
    "auth/invalid-credential": "Email or password is incorrect",
    "auth/invalid-email": "Invalid email address",
    "auth/user-disabled":
      "This account can't be used. Contact support@puggietype.com for help.",
    "auth/too-many-requests":
      "Too many attempts. Please wait a bit and try again.",
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
      "Please choose a password with at least 8 characters.",
    "auth/requires-recent-login": "Please confirm it's you and try again.",
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
    // shown under every widget; the link text becomes a real link
    notice: {
      text: "This form uses Cloudflare Turnstile to check that you're not a bot. It reads signals such as your IP address and browser details. ",
      privacy: "Privacy Policy",
      privacyHref: "/privacy#accounts-ages-13",
    },
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
      beforeTerms:
        "By creating an account (with email or Google), you agree to our ",
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
    // above "continue": this prompt can create an account (first Google sign-in)
    legalNotice: {
      beforeTerms: "By continuing, you agree to our ",
      terms: "Terms",
      termsHref: "/terms",
      beforePrivacy: " and confirm you've read our ",
      privacy: "Privacy Policy",
      privacyHref: "/privacy",
      end: ".",
    },
  },
  reset: {
    link: "forgot password?",
    title: "reset password",
    submit: "send reset link",
    // same text whether or not the account exists
    sent: "If an account uses that email, we've sent it a link to reset the password. If you don't see it, check your spam folder. The link works once and expires soon.",
    back: "back to sign in",
  },
  verify: {
    notice:
      "Please verify your email address. We sent you a link. We use your email only for account emails like this one and to contact you about your account.",
    resend: "resend email",
    resent: "Verification email sent",
    check: "I've verified it",
    stillUnverified: "Your email isn't verified yet",
    verified: "Email verified",
  },
  // email action links, /account/action: Legal review 2026-11-19 (accounts-p1, 1b)
  action: {
    title: "account",
    checking: "Checking your link...",
    linkInvalid:
      "This link has expired or has already been used. You can ask for a new one.",
    notValid: "This link isn't valid.",
    requestNewReset: "send a new reset link",
    toSignIn: "go to sign in",
    // opens /login?reset=1 (the reset form)
    resetPassword: "reset password",
    resetTitle: "choose a new password",
    newPassword: "new password",
    confirmPassword: "confirm new password",
    // password.ts MIN_PASSWORD_LENGTH
    passwordRule: "Use at least 8 characters.",
    mismatch: "The passwords don't match.",
    resetSubmit: "save new password",
    resetDone: "Your password has been changed. You can now sign in with it.",
    verifyDone: "Your email is verified. Thanks!",
    recoverDone:
      "Your sign-in email has been changed back. If you didn't ask for the change, someone else may have had access to your account, so reset your password now.",
  },
  // data export: Legal review 2026-11-19 (accounts-p1, 1b)
  exportData: {
    button: "Download my data",
    busy: "Preparing your data...",
    fileName: "puggietype-data.json",
    // shown above the button (the export includes the sign-in email)
    description:
      "Download a copy of the data we hold for your account: your account details and sign-in email, settings and personal bests, as a JSON file. It also has lists for recent results and flagged runs, which are empty because we don't record those yet. The file isn't password protected, so keep it somewhere private.",
    done: "Your data was downloaded.",
  },
  account: {
    delete: "delete account",
    warning:
      "This permanently deletes your account, your saved settings and personal bests, and your sign-in. It can't be undone. Data stored on this device, and scores you've already submitted to the public leaderboards under a random nickname, aren't affected.",
    confirmPassword: "Enter your password to confirm it's you.",
    confirmGoogle: "You'll confirm it's you with Google.",
    confirm: "delete my account",
    cancel: "cancel",
    deleted: "Your account and saved data were deleted.",
    // the server finishes removing the sign-in (Legal review (f))
    partiallyDeleted:
      "Your account and saved data have been deleted. We couldn't finish removing your sign-in details just now, so we'll remove them automatically within 30 days. You don't need to do anything. Questions? Email support@puggietype.com.",
  },
  signedIn: {
    title: "signed in",
    signOut: "sign out",
    // under the title
    syncNote:
      "While you're signed in, your settings are saved to your account and sync to your other devices, and new personal bests are saved too. Sign out to stop syncing; delete your account to remove what we saved.",
    // at the bottom; the link texts become real links
    footer: {
      before: "Your data: ",
      privacy: "Privacy Policy",
      privacyHref: "/privacy",
      separator: " · ",
      terms: "Terms",
      termsHref: "/terms",
      email: "support@puggietype.com",
      emailHref: "mailto:support@puggietype.com",
    },
  },
  // personal bests list: Legal review 2026-11-19 (accounts-p1, 1b)
  personalBests: {
    title: "Your personal bests",
    // under the title
    note: "Personal bests are saved from your browser and aren't verified. Only you can see them here, and they aren't used for leaderboards.",
    loading: "Loading your personal bests...",
    empty:
      "No personal bests yet. Finish a time or words test to set your first one.",
    error: "We couldn't load your personal bests. Please try again later.",
    retry: "try again",
    /** e.g. "time 60 english, 85.4 wpm, 97.2% acc" */
    row: (pb: {
      mode: string;
      mode2: string;
      language: string;
      punctuation: boolean;
      numbers: boolean;
      wpm: number;
      acc: number;
    }): string => {
      const one = (n: number): string => String(Math.round(n * 10) / 10);
      const extras = [
        pb.punctuation ? " punctuation" : "",
        pb.numbers ? " numbers" : "",
      ].join("");
      const language = pb.language.replace(/_/g, " ");
      return `${pb.mode} ${pb.mode2} ${language}${extras}, ${one(pb.wpm)} wpm, ${one(pb.acc)}% acc`;
    },
  },
} as const;
