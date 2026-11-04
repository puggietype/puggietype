import { JSXElement } from "solid-js";

import { getAccountUser } from "../../../accounts/state";
import { Button } from "../../common/Button";

/** accounts sign-in (VITE_FEATURE_ACCOUNTS) entry point, standalone builds */
export function AccountsNavButton(props: { class?: string }): JSXElement {
  const signedIn = (): boolean => getAccountUser() !== null;
  return (
    <Button
      variant="text"
      href="/login"
      balloon={{
        text: signedIn() ? "signed in" : "sign in",
        position: "down",
      }}
      dataset={{ "data-nav-item": "login" }}
      fa={{
        icon: "fa-user",
        variant: signedIn() ? "solid" : "regular",
        fixedWidth: true,
      }}
      router-link
      class={props.class}
    />
  );
}
