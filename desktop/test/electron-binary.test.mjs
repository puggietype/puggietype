// CI guard (QA): the Electron binary must be installed. Without it the
// shell can't start and smoke checks would silently do nothing, so fail.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

describe("electron binary", () => {
  it("is installed and executable", () => {
    const require = createRequire(import.meta.url);
    const bin = require("electron");
    assert.equal(
      typeof bin,
      "string",
      "electron did not resolve to a binary path (postinstall download missing?)",
    );
    assert.ok(fs.existsSync(bin), `electron binary missing at ${bin}`);
    fs.accessSync(bin, fs.constants.X_OK);
  });
});
