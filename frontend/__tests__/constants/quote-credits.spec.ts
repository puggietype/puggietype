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

  it("uses Legal's exact credits line and never the upstream name", () => {
    expect(QUOTE_CREDITS_LINE).toBe(
      "Quotes are short excerpts credited to their original authors and remain their property. Their authors aren't affiliated with PuggieType and don't endorse it. To report a quote, email support@puggietype.com.",
    );
    expect(QUOTE_CREDITS_LINE.toLowerCase()).not.toContain("monkeytype");
  });
});
