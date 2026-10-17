import { JSXElement } from "solid-js";

// static markup from brand/logo/pug-head.svg: ink = currentColor, fills from theme vars
export const PUG_HEAD_PATHS = `<path d="M5,52 C4,30 16,14 32,14 C48,14 60,30 59,52 Z" fill="var(--pug-fill, #F0D9B5)" stroke="currentColor" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M20,20 C13,18 7,23 7,31 C7,36 10,38 13.5,36 C16,34 17,29 22,26 Z M44,20 C51,18 57,23 57,31 C57,36 54,38 50.5,36 C48,34 47,29 42,26 Z" fill="var(--pug-mask, #3B2B23)" stroke="currentColor" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M28,24 q4,-2 8,0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="23" cy="32.5" r="3.4" fill="currentColor"/><circle cx="41" cy="32.5" r="3.4" fill="currentColor"/><circle cx="21.9" cy="31.2" r="1.25" fill="#FFFFFF"/><circle cx="39.9" cy="31.2" r="1.25" fill="#FFFFFF"/><ellipse cx="14.5" cy="40.5" rx="3.6" ry="2.1" fill="var(--pug-blush, #F4A6A6)"/><ellipse cx="49.5" cy="40.5" rx="3.6" ry="2.1" fill="var(--pug-blush, #F4A6A6)"/><rect x="20" y="38" width="24" height="9" rx="4.5" fill="var(--pug-mask, #3B2B23)" stroke="currentColor" stroke-width="1.6"/><path d="M30,41.5 h4" stroke="var(--pug-fill, #F0D9B5)" stroke-width="1.6" stroke-linecap="round"/>`;

/** puggietype head mark, inked with currentColor */
export function PugHead(props: { class?: string }): JSXElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      class={props.class}
      aria-hidden="true"
      // oxlint-disable-next-line solid/no-innerhtml -- static constant markup
      innerHTML={PUG_HEAD_PATHS}
    ></svg>
  );
}
