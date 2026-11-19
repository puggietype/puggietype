import { JSXElement } from "solid-js";

const linkClass = "text-sub underline hover:text-text";

/** Terms/Privacy links in forms: a new tab, so a half-filled form survives */
export function NewTabLink(props: { href: string; text: string }): JSXElement {
  return (
    <a class={linkClass} href={props.href} target="_blank" rel="noopener">
      {props.text}
    </a>
  );
}
