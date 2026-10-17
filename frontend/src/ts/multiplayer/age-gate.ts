import { createSignal } from "solid-js";

const AGE_KEY = "puggie-mp-age-confirmed";

/** the user confirmed they are 13+ (Terms); required before any WS connection */
export function isAgeConfirmed(): boolean {
  try {
    return localStorage.getItem(AGE_KEY) === "true";
  } catch {
    return false;
  }
}

const [ageConfirmed, setAgeConfirmed] = createSignal(isAgeConfirmed());
export { ageConfirmed };

export function confirmAge(): void {
  try {
    localStorage.setItem(AGE_KEY, "true");
  } catch {
    // storage blocked: confirmed for this page load only
  }
  setAgeConfirmed(true);
}
