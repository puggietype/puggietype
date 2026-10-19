import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { confirmAge } from "../../src/ts/multiplayer/age-gate";
import { MultiplayerClient } from "../../src/ts/multiplayer/client";
import type { ServerMessage } from "../../src/ts/multiplayer/protocol";

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  private listeners = new Map<string, ((e: unknown) => void)[]>();
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(): void {
    this.readyState = 3;
  }
  emit(type: string, event: unknown = {}): void {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
  open(): void {
    this.readyState = 1;
    this.emit("open");
  }
  receive(msg: ServerMessage): void {
    this.emit("message", { data: JSON.stringify(msg) });
  }
  serverClose(code: number): void {
    this.readyState = 3;
    this.emit("close", { code });
  }
  types(): unknown[] {
    return this.sent.map((m) => m["type"]);
  }
}

function lastSocket(): FakeSocket {
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  if (socket === undefined) throw new Error("no socket");
  return socket;
}

function setup(): {
  client: MultiplayerClient;
  messages: ServerMessage[];
  statuses: string[];
  terminated: number[];
  full: (number | undefined)[];
} {
  const messages: ServerMessage[] = [];
  const statuses: string[] = [];
  const terminated: number[] = [];
  const full: (number | undefined)[] = [];
  const client = new MultiplayerClient({
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    onTerminated: (c) => terminated.push(c),
    onFull: (ms) => full.push(ms),
  });
  return { client, messages, statuses, terminated, full };
}

const welcome: ServerMessage = {
  type: "welcome",
  playerId: "p1",
  sessionToken: "secret",
  name: "ZippyPug42",
  protocol: 1,
};

describe("MultiplayerClient", () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    sessionStorage.clear();
    localStorage.clear();
    confirmAge();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("pings five times, then says hello, on open", () => {
    const { client } = setup();
    client.connect();
    lastSocket().open();
    expect(lastSocket().types()).toEqual([
      "ping",
      "ping",
      "ping",
      "ping",
      "ping",
      "hello",
    ]);
    expect(lastSocket().sent[5]).toEqual({
      type: "hello",
      ageConfirmed: true,
      character: "puggie",
    });
  });

  it("never opens a socket before the age is confirmed", async () => {
    localStorage.clear();
    vi.resetModules();
    const { MultiplayerClient: FreshClient } =
      await import("../../src/ts/multiplayer/client");
    const client = new FreshClient({
      onMessage: () => undefined,
      onStatus: () => undefined,
      onTerminated: () => undefined,
      onFull: () => undefined,
    });
    client.connect();
    client.send({ type: "room:create" });
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it("queues messages until welcome, keeping the latest per type", () => {
    const { client } = setup();
    client.connect();
    client.send({ type: "player:ready", ready: true });
    client.send({ type: "room:join", code: "ABC234" });
    client.send({ type: "player:ready", ready: false });
    const socket = lastSocket();
    socket.open();
    socket.receive(welcome);
    expect(socket.sent.slice(6)).toEqual([
      { type: "room:join", code: "ABC234" },
      { type: "player:ready", ready: false },
    ]);
  });

  it("never queues progress", () => {
    const { client } = setup();
    client.connect();
    client.send({
      type: "race:progress",
      wordIndex: 1,
      charIndex: 0,
      testMs: 100,
      wpm: 50,
      errors: 0,
    });
    const socket = lastSocket();
    socket.open();
    socket.receive(welcome);
    expect(socket.types()).not.toContain("race:progress");
  });

  it("reconnects with the stored session after a drop", () => {
    const { client, statuses } = setup();
    client.connect();
    lastSocket().open();
    lastSocket().receive(welcome);
    lastSocket().serverClose(1006);
    expect(statuses.at(-1)).toBe("reconnecting");
    vi.advanceTimersByTime(600);
    expect(FakeSocket.instances).toHaveLength(2);
    lastSocket().open();
    expect(lastSocket().sent.at(-1)).toEqual({
      type: "hello",
      playerId: "p1",
      sessionToken: "secret",
      ageConfirmed: true,
      character: "puggie",
    });
  });

  it("stops for good when another tab takes over", () => {
    const { client, terminated } = setup();
    client.connect();
    lastSocket().open();
    lastSocket().receive(welcome);
    lastSocket().serverClose(4000);
    vi.advanceTimersByTime(10_000);
    expect(terminated).toEqual([4000]);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("4503 close: full, no reconnect backoff, connect() waits for retryFull", () => {
    const { client, statuses, terminated, full } = setup();
    client.connect();
    lastSocket().open();
    lastSocket().serverClose(4503);
    expect(statuses.at(-1)).toBe("full");
    expect(full).toEqual([undefined]);
    expect(terminated).toEqual([]);
    vi.advanceTimersByTime(120_000);
    expect(FakeSocket.instances).toHaveLength(1);
    // other callers (hub mount, open rooms) don't hammer a full server
    client.connect();
    expect(FakeSocket.instances).toHaveLength(1);

    client.retryFull();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(statuses.at(-1)).toBe("connecting");
    lastSocket().open();
    lastSocket().receive(welcome);
    expect(statuses.at(-1)).toBe("open");
    expect(client.connected).toBe(true);
  });

  it("server_full message: passes retryAfterMs on, not to onMessage", () => {
    const { client, messages, full } = setup();
    client.connect();
    lastSocket().open();
    lastSocket().receive({
      type: "server_full",
      retryAfterMs: 30_000,
      message: "Server is full",
    });
    expect(messages).toEqual([]);
    lastSocket().serverClose(4503);
    expect(full).toEqual([30_000]);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("treats the legacy 4002 close as full too", () => {
    const { client, full, terminated } = setup();
    client.connect();
    lastSocket().open();
    lastSocket().serverClose(4002);
    expect(full).toEqual([undefined]);
    expect(terminated).toEqual([]);
  });

  it("a full refusal drops queued messages (the caller redoes them)", () => {
    const { client } = setup();
    client.connect();
    client.send({ type: "room:create" });
    lastSocket().serverClose(4503);
    client.retryFull();
    lastSocket().open();
    lastSocket().receive(welcome);
    expect(lastSocket().types()).not.toContain("room:create");
  });

  it("an error with SERVER_FULL keeps the socket open", () => {
    const { client, messages, statuses } = setup();
    client.connect();
    lastSocket().open();
    lastSocket().receive(welcome);
    lastSocket().receive({
      type: "error",
      code: "SERVER_FULL",
      message: "Server is full",
      retryAfterMs: 5_000,
    });
    expect(messages.at(-1)).toMatchObject({ code: "SERVER_FULL" });
    expect(statuses.at(-1)).toBe("open");
    expect(client.connected).toBe(true);
  });

  it("estimates the server clock from pongs", () => {
    vi.setSystemTime(1000);
    const { client } = setup();
    client.connect();
    const socket = lastSocket();
    socket.open();
    vi.setSystemTime(1040);
    for (const ping of socket.sent.filter((m) => m["type"] === "ping")) {
      // server is 5000 ms ahead, stamped mid-trip
      socket.receive({
        type: "pong",
        t: ping["t"] as number,
        serverNow: 6020,
      });
    }
    expect(client.serverNow()).toBe(Date.now() + 5000);
  });
});
