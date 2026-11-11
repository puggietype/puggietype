#!/usr/bin/env node
// Fake Steamworks ticket helper for desktop/test/ticket-helper.test.mjs.
// No SDK: behaviour comes from FAKE_TICKET_MODE.
const mode = process.env.FAKE_TICKET_MODE ?? "ok";
const TICKET = "14000000" + "ab".repeat(120);
if (mode === "ok") process.stdout.write(TICKET + "\n");
else if (mode === "noisy") {
  process.stderr.write("steam: debug chatter\n");
  process.stdout.write(TICKET);
} else if (mode === "junk") process.stdout.write("not a ticket\n");
else if (mode === "two") process.stdout.write(TICKET + "\n" + TICKET + "\n");
else if (mode === "fail") {
  process.stdout.write(TICKET);
  process.exitCode = 3;
} else if (mode === "huge") process.stdout.write("ab".repeat(20000));
else if (mode === "hang") setTimeout(() => {}, 60_000);
