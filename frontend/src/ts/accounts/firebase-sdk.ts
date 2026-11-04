// The only module that imports the real Firebase SDK in a standalone build
// (see vite-plugins/firebase-stub.ts). Load it with import() only: Firebase
// must not load for visitors who never open sign-in.
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  Auth,
  createUserWithEmailAndPassword,
  deleteUser,
  getAdditionalUserInfo,
  getAuth,
  getIdToken,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";

import { FirebaseWebConfig } from "./config";

// named so it never clashes with the legacy (BACKEND_URL) default app
const APP_NAME = "puggietype-accounts";

export type AuthUser = Pick<User, "uid" | "emailVerified">;

let auth: Auth | undefined;

function getAccountsAuth(config: FirebaseWebConfig): Auth {
  if (auth !== undefined) return auth;
  const app = getApps().some((a) => a.name === APP_NAME)
    ? getApp(APP_NAME)
    : initializeApp(config, APP_NAME);
  auth = getAuth(app);
  return auth;
}

export async function signInEmail(
  config: FirebaseWebConfig,
  email: string,
  password: string,
): Promise<User> {
  const result = await signInWithEmailAndPassword(
    getAccountsAuth(config),
    email,
    password,
  );
  return result.user;
}

/** `isNew`: this popup just created the Firebase user */
export async function signInGoogle(
  config: FirebaseWebConfig,
): Promise<{ user: User; isNew: boolean }> {
  const result = await signInWithPopup(
    getAccountsAuth(config),
    new GoogleAuthProvider(),
  );
  return {
    user: result.user,
    isNew: getAdditionalUserInfo(result)?.isNewUser ?? false,
  };
}

export async function createUserEmail(
  config: FirebaseWebConfig,
  email: string,
  password: string,
): Promise<User> {
  const result = await createUserWithEmailAndPassword(
    getAccountsAuth(config),
    email,
    password,
  );
  return result.user;
}

/** removes the Firebase user; needs a recent sign-in */
export async function deleteFirebaseUser(user: User): Promise<void> {
  await deleteUser(user);
}

/** `refresh` forces a new token (fresh auth_time after a re-auth) */
export async function getUserIdToken(
  user: User,
  refresh = false,
): Promise<string> {
  return getIdToken(user, refresh);
}

/** the persisted user once Firebase has restored it, else null */
export async function getRestoredUser(
  config: FirebaseWebConfig,
): Promise<User | null> {
  const a = getAccountsAuth(config);
  await a.authStateReady();
  return a.currentUser;
}

export async function signOutFirebase(
  config: FirebaseWebConfig,
): Promise<void> {
  await signOut(getAccountsAuth(config));
}
