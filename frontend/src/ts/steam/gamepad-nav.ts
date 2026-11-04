/**
 * Steam-only controller navigation for menus (settings): D-pad or left
 * stick moves focus through the page's focusable controls in tab order,
 * left/right also steps a focused slider, A presses, B leaves the control.
 * Keyboard navigation is the browser's own (Tab, arrows on sliders, Enter
 * and Space). Loaded behind the inline __PLATFORM__ steam check.
 */
export type NavAction = "prev" | "next" | "left" | "right" | "press" | "back";

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function focusables(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      el.hidden !== true &&
      el.getAttribute("aria-hidden") !== "true" &&
      el.closest("[hidden], [inert]") === null,
  );
}

/** what a gamepad snapshot asks for (standard mapping), or null */
export function actionOf(pad: {
  buttons: readonly { pressed: boolean }[];
  axes: readonly number[];
}): NavAction | null {
  const b = (i: number): boolean => pad.buttons[i]?.pressed === true;
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  if (b(0)) return "press";
  if (b(1)) return "back";
  if (b(12) || y < -0.5) return "prev";
  if (b(13) || y > 0.5) return "next";
  if (b(14) || x < -0.5) return "left";
  if (b(15) || x > 0.5) return "right";
  return null;
}

function isRange(el: Element | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === "range";
}

function stepRange(el: HTMLInputElement, dir: -1 | 1): void {
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  const step = Number(el.step || 1);
  const next = Math.min(max, Math.max(min, Number(el.value) + dir * step));
  // round to the step's decimals (0.1 + 0.2 style drift)
  const decimals = (String(step).split(".")[1] ?? "").length;
  el.value = next.toFixed(decimals);
}

/** perform one action on the document */
export function perform(action: NavAction, doc: Document = document): void {
  const active = doc.activeElement as HTMLElement | null;
  if ((action === "left" || action === "right") && isRange(active)) {
    stepRange(active, action === "left" ? -1 : 1);
    active.dispatchEvent(new Event("input", { bubbles: true }));
    active.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (action === "press") {
    if (active !== null && active !== doc.body) active.click();
    return;
  }
  if (action === "back") {
    active?.blur();
    return;
  }
  const list = focusables(doc);
  if (list.length === 0) return;
  const i = active === null ? -1 : list.indexOf(active);
  const forward = action === "next" || action === "right";
  const next =
    i === -1
      ? forward
        ? list[0]
        : list[list.length - 1]
      : list[(i + (forward ? 1 : -1) + list.length) % list.length];
  next?.focus();
  next?.scrollIntoView?.({ block: "nearest" });
}

const REPEAT_FIRST_MS = 400;
const REPEAT_MS = 120;

/**
 * Poll gamepads every frame while one is connected (starts on the first
 * gamepadconnected, stops when none is left); held directions repeat.
 */
export function installGamepadNav(win: Window = window): () => void {
  if (typeof win.navigator.getGamepads !== "function") return () => undefined;
  let held: NavAction | null = null;
  let nextAt = 0;
  let stopped = false;
  let running = false;
  const loop = (t: number): void => {
    const pad = [...win.navigator.getGamepads()].find((p) => p !== null);
    if (stopped || pad === undefined) {
      running = false;
      return;
    }
    const a = actionOf(pad);
    if (a === null) {
      held = null;
    } else if (a !== held) {
      held = a;
      nextAt = t + REPEAT_FIRST_MS;
      perform(a, win.document);
    } else if (t >= nextAt && a !== "press" && a !== "back") {
      nextAt = t + REPEAT_MS;
      perform(a, win.document);
    }
    win.requestAnimationFrame(loop);
  };
  const start = (): void => {
    if (running || stopped) return;
    running = true;
    win.requestAnimationFrame(loop);
  };
  win.addEventListener("gamepadconnected", start);
  start();
  return () => {
    stopped = true;
    win.removeEventListener("gamepadconnected", start);
  };
}
