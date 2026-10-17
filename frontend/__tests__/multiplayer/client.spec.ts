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
} {
  const messages: ServerMessage[] = [];
  const statuses: string[] = [];
  const terminated: number[] = [];
  const client = new MultiplayerClient({
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    onTerminated: (c) => terminated.push(c),
  });
  return { client, messages, statuses, terminated };
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
    expect(lastSocket().sent[5]).toEqual({ type: "hello", ageConfirmed: true });
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
