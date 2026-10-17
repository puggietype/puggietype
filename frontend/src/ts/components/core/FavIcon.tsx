import { Link } from "@solidjs/meta";
import { createMemo, JSXElement } from "solid-js";

import { Theme } from "../../constants/themes";
import { isColorDark } from "../../utils/colors";
import { isDevEnvironment } from "../../utils/env";
import { PUG_HEAD_PATHS } from "../common/PugHead";
import { getPugVariant } from "../pages/test/pug-frames";

export function FavIcon(props: {
  theme: Theme & { name: string };
}): JSXElement {
  const icon = createMemo<string>(() => {
    // pug head mark on a theme-coloured tile: tile = main, ink = the darker
    // of bg/text so it reads on the light pug fill
    const { bg, text } = props.theme;
    let tile = props.theme.main;
    let ink = isColorDark(bg) || !isColorDark(text) ? bg : text;
    if (isDevEnvironment()) {
      tile = bg;
    }
    if (tile === ink) {
      tile = "#E8A96B";
      ink = "#161514";
    }
    // brand colours on puggie themes, mono line art elsewhere
    const vars =
      getPugVariant(props.theme.name) === "mono"
        ? `--pug-fill:#FFFFFF;--pug-mask:${ink};--pug-blush:transparent;`
        : "";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" style="color:${ink};${vars}"><rect width="64" height="64" rx="14" fill="${tile}"/>${PUG_HEAD_PATHS}</svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  });

  return (
    <Link id="favicon" rel="shortcut icon" type="image/svg+xml" href={icon()} />
  );
}
