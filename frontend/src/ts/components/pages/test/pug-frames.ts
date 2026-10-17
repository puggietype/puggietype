/**
 * Pug mascot frames. Each frame is a swappable svg in static/images/pug/,
 * loaded by filename (see the README in that folder).
 */
export const PUG_FRAME_FILES = {
  idle: "pug-idle.svg",
  blink: "pug-blink.svg",
  left: "pug-left-paw-down.svg",
  right: "pug-right-paw-down.svg",
  both: "pug-both-down.svg",
  leftHalf: "pug-left-paw-half.svg",
  rightHalf: "pug-right-paw-half.svg",
} as const;

export type PugFrame = keyof typeof PUG_FRAME_FILES;
export type PugHandsFrame = "idle" | "left" | "right" | "both";

export function getPugFrameUrl(frame: PugFrame): string {
  return `/images/pug/${PUG_FRAME_FILES[frame]}`;
}

export function getHandsFrame(hands: {
  left: boolean;
  right: boolean;
}): PugHandsFrame {
  if (hands.left && hands.right) return "both";
  if (hands.left) return "left";
  if (hands.right) return "right";
  return "idle";
}

/** half-raised paw shown briefly when a single paw goes down or up */
export function getTransitionFrame(
  prev: PugHandsFrame,
  next: PugHandsFrame,
): PugFrame | undefined {
  const pair = [prev, next];
  if (!pair.includes("idle")) return undefined;
  if (pair.includes("left")) return "leftHalf";
  if (pair.includes("right")) return "rightHalf";
  return undefined;
}

/**
 * Prepare fetched svg markup for inlining (so theme css vars apply):
 * drop the xml prolog, fixed size, root ink colour, scripts and event
 * handlers, and prefix ids so several inlined frames don't collide.
 */
export function normalizePugSvg(
  markup: string,
  idPrefix = "",
): string | undefined {
  const start = markup.indexOf("<svg");
  if (start === -1) return undefined;
  let svg = markup.slice(start).trim();
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "");
  svg = svg.replace(/^<svg([^>]*)>/, (_tag, attrs: string) => {
    const cleaned = attrs.replace(/\s(width|height|color)="[^"]*"/g, "");
    return `<svg${cleaned}>`;
  });
  if (idPrefix !== "") {
    svg = svg
      .replace(/\sid="([^"]+)"/g, ` id="${idPrefix}$1"`)
      .replace(/url\(\s*#([^)\s]+)\s*\)/g, `url(#${idPrefix}$1)`)
      .replace(/(\s(?:xlink:)?href)="#([^"]+)"/g, `$1="#${idPrefix}$2"`);
  }
  return svg;
}
