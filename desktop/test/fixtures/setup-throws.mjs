// Fixture for test/setup-fails.test.mjs (not matched by test/*.test.mjs):
// setup that throws, the way package.test.mjs stages its package.
import { before, describe, it } from "node:test";

describe("setup throws", () => {
  before(() => {
    throw new Error("staging failed");
  });
  it("never runs", () => {});
});
