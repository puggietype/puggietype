import { Link } from "@solidjs/meta";
import { createMemo, JSXElement } from "solid-js";

import { Theme } from "../../constants/themes";
import { isDevEnvironment } from "../../utils/env";

export function FavIcon(props: { theme: Theme }): JSXElement {
  const icon = createMemo<string>(() => {
    // pug head on a theme-coloured tile: tile = main, ink = bg, fill = text
    let { main: tile, bg: ink, text: fill } = props.theme;
    if (isDevEnvironment()) {
      [tile, ink] = [ink, tile];
    }
    if (tile === ink) {
      tile = "#E8A96B";
      ink = "#161514";
      fill = "#F0D9B5";
    }

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="${tile}"/>
      <g stroke="${ink}" stroke-linejoin="round" stroke-linecap="round">
        <path d="M5,52 C4,30 16,14 32,14 C48,14 60,30 59,52 Z" fill="${fill}" stroke-width="3.4"/>
        <path d="M20,20 C13,18 7,23 7,31 C7,36 10,38 13.5,36 C16,34 17,29 22,26 Z M44,20 C51,18 57,23 57,31 C57,36 54,38 50.5,36 C48,34 47,29 42,26 Z" fill="${ink}" stroke-width="3.4"/>
        <path d="M28,24 q4,-2 8,0" fill="none" stroke-width="2.4"/>
        <circle cx="23" cy="32.5" r="3.4" fill="${ink}"/>
        <circle cx="41" cy="32.5" r="3.4" fill="${ink}"/>
        <rect x="20" y="38" width="24" height="9" rx="4.5" fill="${ink}" stroke-width="1.6"/>
      </g>
    </svg>
    `;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  });

  return (
    <Link id="favicon" rel="shortcut icon" type="image/svg+xml" href={icon()} />
  );
}
