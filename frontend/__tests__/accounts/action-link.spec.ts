import { describe, expect, it, vi } from "vitest";

import {
  captureActionLink,
  takeActionLink,
} from "../../src/ts/accounts/action-link";

function at(url: string): {
  loc: { pathname: string; search: string; hash: string };
  hist: {
    state: unknown;
    replaceState: ReturnType<typeof vi.fn<History["replaceState"]>>;
  };
} {
  const u = new URL(url, "https://puggietype.test");
  return {
    loc: { pathname: u.pathname, search: u.search, hash: u.hash },
    hist: { state: { s: 1 }, replaceState: vi.fn<History["replaceState"]>() },
  };
}

describe("action link", () => {
  it("keeps only mode and oobCode, replaces the URL with the bare path", () => {
    const { loc, hist } = at(
      "/account/action?mode=resetPassword&oobCode=abc&continueUrl=https%3A%2F%2Fevil.example&apiKey=k&lang=fr",
    );
    captureActionLink(loc, hist);
    expect(hist.replaceState).toHaveBeenCalledWith(
      { s: 1 },
      "",
      "/account/action",
    );
    expect(takeActionLink()).toEqual({ mode: "resetPassword", oobCode: "abc" });
  });

  it("is taken once", () => {
    const { loc, hist } = at("/account/action?mode=verifyEmail&oobCode=x");
    captureActionLink(loc, hist);
    expect(takeActionLink()).toBeDefined();
    expect(takeActionLink()).toBeUndefined();
  });

  it("a bare revisit doesn't wipe a captured link or touch history", () => {
    const first = at("/account/action?mode=verifyEmail&oobCode=x");
    captureActionLink(first.loc, first.hist);
    const bare = at("/account/action");
    captureActionLink(bare.loc, bare.hist);
    expect(bare.hist.replaceState).not.toHaveBeenCalled();
    expect(takeActionLink()).toEqual({ mode: "verifyEmail", oobCode: "x" });
  });
});
