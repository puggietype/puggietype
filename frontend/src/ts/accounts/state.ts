import { createSignal } from "solid-js";

import { SessionUser } from "./api";

/** the signed-in accounts user, null when signed out */
// pure: an off build (nav button dropped) then drops the signal too
export const [getAccountUser, setAccountUser] =
  /* @__PURE__ */ createSignal<SessionUser | null>(null);
