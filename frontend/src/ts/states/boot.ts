// set by ready.ts once the stored config is applied and auth has settled.
// Replaces `document.readyState === "complete"` checks: the app now boots
// after the first paint (ts/boot.ts), usually after the load event
let settled = false;

export function isBootSettled(): boolean {
  return settled;
}

export function markBootSettled(): void {
  settled = true;
}
