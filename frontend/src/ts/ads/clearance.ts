type Box = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

/** gap between two boxes in px (0 when they touch or overlap) */
export function boxDistance(a: Box, b: Box): number {
  const dx = Math.max(0, b.left - a.right, a.left - b.right);
  const dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
  return Math.hypot(dx, dy);
}

/** smallest gap between `ad` and any visible box, Infinity if none */
export function minClearance(ad: Box, others: Iterable<Box>): number {
  let min = Infinity;
  for (const box of others) {
    if (box.right - box.left <= 0 || box.bottom - box.top <= 0) continue;
    min = Math.min(min, boxDistance(ad, box));
  }
  return min;
}

/** what an ad must keep its distance from: buttons, links, inputs, typing area */
export const AD_CLEARANCE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea:not(#wordsInput)",
  "#words",
  "#wordsWrapper",
  "#typingTest",
  "[data-ui-element='restartTestButton']",
].join(",");
