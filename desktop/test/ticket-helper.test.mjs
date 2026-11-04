// Steam ticket helper spawn and fallback (PUGGIE_STEAM_SDK, off by default),
// with a fake helper script: no Steamworks SDK anywhere.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  parseTicketOutput,
  runTicketHelper,
  steamSdkEnabled,
  ticketHelperName,
} from "../src/shell.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(here, "fixtures", "fake-ticket-helper.mjs");
const TICKET = "14000000" + "ab".repeat(120);

function run(mode, timeoutMs = 3000) {
  const prev = process.env.FAKE_TICKET_MODE;
  process.env.FAKE_TICKET_MODE = mode;
  try {
    return runTicketHelper(FAKE, {
      spawn,
      exists: (f) => fs.existsSync(f),
      timeoutMs,
    });
  } finally {
    if (prev === undefined) delete process.env.FAKE_TICKET_MODE;
    else process.env.FAKE_TICKET_MODE = prev;
  }
}

describe("steam ticket helper", () => {
  it("is off unless PUGGIE_STEAM_SDK=1", () => {
    assert.equal(steamSdkEnabled({}), false);
    assert.equal(steamSdkEnabled({ PUGGIE_STEAM_SDK: "true" }), false);
    assert.equal(steamSdkEnabled({ PUGGIE_STEAM_SDK: "1" }), true);
    assert.equal(ticketHelperName("win32"), "steam-ticket-helper.exe");
    assert.equal(ticketHelperName("linux"), "steam-ticket-helper");
  });
  it("reads only the hex ticket from stdout", async () => {
    assert.equal(await run("ok"), TICKET);
    assert.equal(await run("noisy"), TICKET); // stderr ignored
  });
  it("anything else is null (fallback to the token, then OpenID)", async () => {
    for (const mode of ["junk", "two", "fail", "huge"]) {
      assert.equal(await run(mode), null, mode);
    }
  });
  it("times out and kills a hung helper", async () => {
    const t0 = Date.now();
    assert.equal(await run("hang", 300), null);
    assert.ok(Date.now() - t0 < 2000);
  });
  it("a missing helper is null without spawning", async () => {
    let spawned = false;
    const r = await runTicketHelper("/nope/steam-ticket-helper", {
      spawn: () => {
        spawned = true;
        throw new Error("no");
      },
      exists: () => false,
    });
    assert.equal(r, null);
    assert.equal(spawned, false);
  });
  it("spawns one-shot: no shell, no arguments, only stdout piped", async () => {
    let call;
    const fake = (file, args, opts) => {
      call = { file, args, opts };
      return spawn(process.execPath, ["-e", ""], opts);
    };
    await runTicketHelper("/x/helper", { spawn: fake, exists: () => true });
    assert.deepEqual(call.args, []);
    assert.equal(call.opts.shell, false);
    assert.deepEqual(call.opts.stdio, ["ignore", "pipe", "ignore"]);
  });
  it("parseTicketOutput", () => {
    assert.equal(parseTicketOutput(` ${TICKET}\n`), TICKET);
    assert.equal(parseTicketOutput("ab"), null);
    assert.equal(parseTicketOutput(undefined), null);
  });
  it("main.mjs never logs the ticket and gates it on the flag", () => {
    const main = fs.readFileSync(path.join(here, "../src/main.mjs"), "utf8");
    assert.match(main, /steamEnabled && steamSdkEnabled\(process\.env\)/);
    assert.doesNotMatch(main, /console\.\w+\([^)]*ticket/i);
  });
});
