import { JSXElement, Show } from "solid-js";

import { Button } from "../../components/common/Button";
import { H3 } from "../../components/common/Headers";
import { AccountUser } from "../api";
import { signOut } from "../session";
import { accountsCopy } from "../strings";
import { DeleteAccount } from "./DeleteAccount";
import { PersonalBests } from "./PersonalBests";
import { VerifyEmailNotice } from "./VerifyEmailNotice";

/** /login while signed in: verify notice, personal bests, sign out, delete account */
export function SignedInPanel(props: { user: AccountUser }): JSXElement {
  return (
    <>
      <H3
        text={accountsCopy.signedIn.title}
        fa={{ icon: "fa-user" }}
        class="p-0"
      />
      <Show when={!props.user.emailVerified}>
        <VerifyEmailNotice />
      </Show>
      <PersonalBests />
      <Button
        text={accountsCopy.signedIn.signOut}
        fa={{ icon: "fa-sign-out-alt" }}
        // signed out locally either way
        onClick={() => void signOut().catch(() => undefined)}
      />
      <DeleteAccount />
    </>
  );
}
