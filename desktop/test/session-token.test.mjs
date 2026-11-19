import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SecureTokenStore } from "../src/shell.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = "A".repeat(42) + "b";

function fakes({ available = true, backend = "gnome_libsecret" } = {}) {
  const disk = { data: null, writes: 0 };
  const safe = {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    encryptString: (s) => Buffer.from([...Buffer.from(s)].map((c) => c ^ 0x5a)),
    decryptString: (b) => Buffer.from([...b].map((c) => c ^ 0x5a)).toString(),
  };
  const file = {
    read: () => {
      if (!disk.data) throw new Error("ENOENT");
      return disk.data;
    },
    write: (b) => {
      disk.data = b;
      disk.writes++;
    },
    remove: () => {
      disk.data = null;
    },
  };
  return { store: new SecureTokenStore(safe, file), disk };
}

describe("SecureTokenStore (safeStorage only)", () => {
  it("round-trips a token; only ciphertext reaches the disk", () => {
    const { store, disk } = fakes();
    assert.equal(store.get(), null);
    assert.equal(store.set(TOKEN), true);
    assert.ok(!disk.data.toString().includes(TOKEN));
    assert.equal(store.get(), TOKEN);
    store.clear();
    assert.equal(store.get(), null);
    store.clear();
  });
  it("stores nothing without real secure storage", () => {
    for (const opts of [
      { available: false },
      { backend: "basic_text" },
      { backend: "unknown" },
    ]) {
      const { store, disk } = fakes(opts);
      // canKeep() in the preload is this: false -> the client sends keep:false
      assert.equal(store.available(), false);
      assert.equal(store.set(TOKEN), false);
      assert.equal(disk.writes, 0);
      assert.equal(store.get(), null);
    }
  });
  it("a throwing safeStorage check counts as unavailable", () => {
    const { store } = fakes();
    store.safe.isEncryptionAvailable = () => {
      throw new Error("keyring locked");
    };
    assert.equal(store.available(), false);
    assert.equal(store.set(TOKEN), false);
  });
  it("main.mjs answers canKeep with tokens.available()", () => {
    const main = fs.readFileSync(path.join(here, "../src/main.mjs"), "utf8");
    assert.match(
      main,
      /"steam:session:available"[\s\S]{0,120}tokens\.available\(\)/,
    );
  });
  it("rejects anything that isn't a session token", () => {
    const { store, disk } = fakes();
    for (const bad of [
      "",
      "short",
      TOKEN + "x",
      42,
      null,
      "A".repeat(42) + "=",
    ]) {
      assert.equal(store.set(bad), false);
    }
    assert.equal(disk.writes, 0);
  });
  it("main.mjs keeps the token out of storage.json and the logs", () => {
    const main = fs.readFileSync(path.join(here, "../src/main.mjs"), "utf8");
    assert.match(main, /new SecureTokenStore\(safeStorage,/);
    assert.match(main, /steam-session\.bin/);
    assert.doesNotMatch(main, /console\.\w+\([^)]*token/i);
    const preload = fs.readFileSync(
      path.join(here, "../src/preload.cjs"),
      "utf8",
    );
    assert.doesNotMatch(preload, /localStorage/);
  });
});
