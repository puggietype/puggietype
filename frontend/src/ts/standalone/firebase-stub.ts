// Stands in for "firebase/app", "firebase/auth" and load-firebase-config in
// standalone builds (no BACKEND_URL, see vite.config.ts) so the Firebase SDK,
// its config and its Google endpoints are not bundled. Auth is never
// available there.

function unavailable(): never {
  throw new Error("auth is not available in standalone mode");
}

export class FirebaseError extends Error {
  code = "";
}

class Provider {
  addScope(): this {
    return this;
  }
  setCustomParameters(): this {
    return this;
  }
}
export class GoogleAuthProvider extends Provider {}
export class GithubAuthProvider extends Provider {}
export class EmailAuthProvider extends Provider {
  static credential = unavailable;
}

export const browserSessionPersistence = {};
export const indexedDBLocalPersistence = {};

export const getApps = (): unknown[] => [];
export const getApp = unavailable;
export const initializeApp = unavailable;
export const getAuth = unavailable;
export const setPersistence = unavailable;
export const onAuthStateChanged = unavailable;
export const signInWithEmailAndPassword = unavailable;
export const signInWithPopup = unavailable;
export const createUserWithEmailAndPassword = unavailable;
export const getIdToken = unavailable;
export const getAdditionalUserInfo = unavailable;
export const sendEmailVerification = unavailable;
export const linkWithCredential = unavailable;
export const linkWithPopup = unavailable;
export const reauthenticateWithCredential = unavailable;
export const reauthenticateWithPopup = unavailable;
export const unlink = unavailable;
export const updateEmail = unavailable;
export const updateProfile = unavailable;
export const applyActionCode = unavailable;
export const checkActionCode = unavailable;
export const confirmPasswordReset = unavailable;
export const sendPasswordResetEmail = unavailable;
export const verifyPasswordResetCode = unavailable;

// replaces constants/load-firebase-config: no config is bundled
export async function loadFirebaseConfig(): Promise<undefined> {
  return undefined;
}
