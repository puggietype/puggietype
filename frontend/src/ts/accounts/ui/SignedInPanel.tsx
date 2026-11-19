import { JSXElement, Show } from "solid-js";

import { Button } from "../../components/common/Button";
import { H3 } from "../../components/common/Headers";
import { AccountUser } from "../api";
import { signOut } from "../session";
import { accountsCopy } from "../strings";
import { DeleteAccount } from "./DeleteAccount";
import { ExportData } from "./ExportData";
import { NewTabLink } from "./NewTabLink";
import { PersonalBests } from "./PersonalBests";
import { VerifyEmailNotice } from "./VerifyEmailNotice";

const copy = accountsCopy.signedIn;
const footer = copy.footer;

/** /login while signed in: sync note, verify notice, personal bests, sign out, export, delete account, data links */
export function SignedInPanel(props: { user: AccountUser }): JSXElement {
  return (
    <>
      <H3 text={copy.title} fa={{ icon: "fa-user" }} class="p-0" />
      <p class="text-sm text-sub">{copy.syncNote}</p>
      <Show when={!props.user.emailVerified}>
        <VerifyEmailNotice />
      </Show>
      <PersonalBests />
      <Button
        text={copy.signOut}
        fa={{ icon: "fa-sign-out-alt" }}
        // signed out locally either way
        onClick={() => void signOut().catch(() => undefined)}
      />
      <ExportData />
      <DeleteAccount />
      <p class="text-xs text-sub" data-testid="signed-in-footer">
        {footer.before}
        <NewTabLink href={footer.privacyHref} text={footer.privacy} />
        {footer.separator}
        <NewTabLink href={footer.termsHref} text={footer.terms} />
        {footer.separator}
        <a class="text-sub underline hover:text-text" href={footer.emailHref}>
          {footer.email}
        </a>
      </p>
    </>
  );
}
