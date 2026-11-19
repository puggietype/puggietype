import { JSXElement } from "solid-js";

import { NewTabLink } from "./NewTabLink";

/** "...agree to our [Terms] and confirm you've read our [Privacy Policy]." */
export function LegalNotice(props: {
  copy: {
    beforeTerms: string;
    terms: string;
    termsHref: string;
    beforePrivacy: string;
    privacy: string;
    privacyHref: string;
    end: string;
  };
  testId: string;
}): JSXElement {
  return (
    <p class="text-xs text-sub" data-testid={props.testId}>
      {props.copy.beforeTerms}
      <NewTabLink href={props.copy.termsHref} text={props.copy.terms} />
      {props.copy.beforePrivacy}
      <NewTabLink href={props.copy.privacyHref} text={props.copy.privacy} />
      {props.copy.end}
    </p>
  );
}
