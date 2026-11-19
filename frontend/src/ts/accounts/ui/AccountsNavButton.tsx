import { JSXElement } from "solid-js";

import { Button } from "../../components/common/Button";
import { getAccountUser } from "../state";
import { accountsCopy } from "../strings";

/** accounts sign-in (VITE_FEATURE_ACCOUNTS) entry point, standalone builds */
export function AccountsNavButton(props: { class?: string }): JSXElement {
  const signedIn = (): boolean => getAccountUser() !== null;
  return (
    <Button
      variant="text"
      href="/login"
      balloon={{
        text: signedIn() ? accountsCopy.nav.signedIn : accountsCopy.nav.signIn,
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
