import { JSXElement } from "solid-js";

import { AdSlot } from "./AdSlot";

/** the one unit on settings and about (not on /privacy, /terms) */
export function InfoAdSlot(): JSXElement {
  return <AdSlot kind="info" />;
}
