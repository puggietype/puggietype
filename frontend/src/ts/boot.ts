// Entry point: let the browser paint the static app shell (html/app-shell.html)
// before the app is fetched and evaluated, which takes seconds on slow phones.
// The import fetches all of the app's chunks in parallel (no waterfall).

const RELOAD_KEY = "bootReloadAt";

function reloadedRecently(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return true;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    return false;
  } catch {
    // storage blocked: never auto-reload, so this can't loop
    return true;
  }
}

function showBootError(): void {
  const shell = document.querySelector("#appShell");
  if (shell === null) return;
  const message = document.createElement("p");
  message.style.cssText =
    "pointer-events:auto;text-align:center;color:var(--text-color)";
  message.textContent = "puggietype failed to load. ";
  const reload = document.createElement("a");
  reload.href = location.href;
  reload.textContent = "reload";
  reload.style.color = "var(--main-color)";
  message.append(reload);
  shell.children[1]?.replaceChildren(message);
}

function boot(): void {
  import("./index").catch(() => {
    // usually a new deploy replaced the chunks this html points at
    if (reloadedRecently()) {
      showBootError();
    } else {
      location.reload();
    }
  });
}

// requestAnimationFrame doesn't run in background tabs: boot those right away
if (document.visibilityState === "hidden") {
  boot();
} else {
  requestAnimationFrame(() => setTimeout(boot, 0));
}
