import { describe, expect, it } from "vitest";
import {
  QUOTE_CREDITS_LINE,
  QUOTE_TAKEDOWN_LINE,
} from "../../src/ts/constants/quote-credits";

describe("quote credits copy", () => {
  it("uses Legal's takedown wording", () => {
    expect(QUOTE_TAKEDOWN_LINE).toBe(
      "email support@puggietype.com to report a quote",
    );
  });

  it("has a credits line and never uses the upstream name", () => {
    expect(QUOTE_CREDITS_LINE.length).toBeGreaterThan(0);
    expect(QUOTE_CREDITS_LINE.toLowerCase()).not.toContain("monkeytype");
  });
});
