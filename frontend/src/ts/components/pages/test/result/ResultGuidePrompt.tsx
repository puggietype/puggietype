import { JSXElement, Show } from "solid-js";

import { getIsScreenshotting } from "../../../../states/core";

// below this the errors cost more than raw speed, so point to accuracy first
export const ACCURACY_TIP_THRESHOLD = 95;

export type ResultGuideTip = {
  lead: string;
  linkText: string;
  href: string;
};

export function getResultGuideTip(acc: number): ResultGuideTip {
  if (acc < ACCURACY_TIP_THRESHOLD) {
    return {
      lead: "Accuracy first:",
      linkText: "see how to cut typing errors",
      href: "/guide/improve-accuracy",
    };
  }
  return {
    lead: "Want to get faster? Our guide has a",
    linkText: "practice plan for typing faster",
    href: "/guide/type-faster",
  };
}

/**
 * One subdued line under the result linking to a guide. Rendered with the
 * result itself (its text depends only on the finished test), so it never
 * shifts anything after the result appears.
 */
export function ResultGuidePrompt(props: { acc: number }): JSXElement {
  const tip = (): ResultGuideTip => getResultGuideTip(props.acc);
  return (
    <Show when={!getIsScreenshotting()}>
      <p class="mt-0 mb-4 text-center text-sm text-sub" data-guide-tip>
        {tip().lead}{" "}
        <a class="underline" href={tip().href}>
          {tip().linkText}
        </a>
        .
      </p>
    </Show>
  );
}
