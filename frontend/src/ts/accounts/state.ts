import { createSignal } from "solid-js";

import { AccountUser } from "./api";

/** the signed-in accounts user, null when signed out */
// pure: an off build (nav button dropped) then drops the signal too
export const [getAccountUser, setAccountUser] =
  /* @__PURE__ */ createSignal<AccountUser | null>(null);
