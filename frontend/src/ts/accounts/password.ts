// Client-side password rule for any path that sets a password, checked
// before Firebase sees it.

import { accountsCopy } from "./strings";

export const MIN_PASSWORD_LENGTH = 8;

/** AuthResult code for a password the client refused */
export const WEAK_PASSWORD = "weak_password";

/** counts characters, not UTF-16 units, so 4 emoji are 4 */
export function isPasswordOk(password: string): boolean {
  return [...password].length >= MIN_PASSWORD_LENGTH;
}

/** the same text Firebase's own auth/weak-password gets */
export function weakPasswordMessage(): string {
  return (
    accountsCopy.firebase["auth/weak-password"] ?? accountsCopy.firebaseFallback
  );
}
