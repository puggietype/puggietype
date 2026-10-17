import { describe, it, expect } from "vitest";

import { canonicalUrl, SITE_ORIGIN } from "../../src/ts/utils/site-url";

describe("site-url", () => {
  it("uses the production origin", () => {
    expect(SITE_ORIGIN).toBe("https://puggietype.com");
  });

  it("maps a pathname to its canonical URL", () => {
    expect(canonicalUrl("/")).toBe("https://puggietype.com/");
    expect(canonicalUrl("/about")).toBe("https://puggietype.com/about");
    expect(canonicalUrl("/race/")).toBe("https://puggietype.com/race");
    expect(canonicalUrl("")).toBe("https://puggietype.com/");
  });
});
