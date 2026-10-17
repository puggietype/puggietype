// Entry point: let the browser paint the static app shell (html/app-shell.html)
// before the app is fetched and evaluated, which takes seconds on slow phones.
// The import fetches all of the app's chunks in parallel (no waterfall).
requestAnimationFrame(() => {
  setTimeout(() => {
    void import("./index");
  }, 0);
});
