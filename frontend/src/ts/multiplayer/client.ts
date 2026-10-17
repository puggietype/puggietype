import { computeClockOffset, type ClockSample } from "./clock";
import { wsUrl } from "./helpers";
import type { ClientMessage, ServerMessage } from "./protocol";

const SESSION_KEY = "puggie-mp-session";
const PING_SAMPLES = 5;
const RECONNECT_DELAYS = [500, 1000, 2000, 4000];
/** close codes after which reconnecting would be wrong */
const NO_RECONNECT_CODES = new Set([4000, 4002]);

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting";

type Session = { playerId: string; sessionToken: string };

type Handlers = {
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
};

function loadSession(): Session | undefined {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (
      typeof parsed.playerId === "string" &&
      typeof parsed.sessionToken === "string"
    ) {
      return { playerId: parsed.playerId, sessionToken: parsed.sessionToken };
    }
  } catch {
    // ignore corrupt storage
  }
  return undefined;
}

function saveSession(session: Session): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * One WebSocket to /ws: clock sync, hello (with the stored session for
 * reconnects), and automatic reconnect with backoff.
 */
export class MultiplayerClient {
  private ws: WebSocket | undefined;
  private name = "";
  private offset = 0;
  private samples: ClockSample[] = [];
  private pingSentAt = new Map<number, number>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private closedByUser = false;
  private queue: ClientMessage[] = [];
  private helloDone = false;
  private readonly handlers: Handlers;

  constructor(handlers: Handlers) {
    this.handlers = handlers;
  }

  get connected(): boolean {
    return this.helloDone && this.ws?.readyState === WebSocket.OPEN;
  }

  /** server epoch ms */
  serverNow(): number {
    return Date.now() + this.offset;
  }

  connect(name: string): void {
    this.name = name;
    this.closedByUser = false;
    if (this.ws !== undefined) {
      // already connected: a re-hello renames
      if (this.connected) this.sendNow(this.helloMessage());
      return;
    }
    this.open("connecting");
  }

  /** queued until the hello round trip is done */
  send(msg: ClientMessage): void {
    if (this.connected) this.sendNow(msg);
    else this.queue.push(msg);
  }

  close(): void {
    this.closedByUser = true;
    clearTimeout(this.reconnectTimer);
    this.queue = [];
    this.ws?.close(1000);
    this.ws = undefined;
    this.helloDone = false;
    this.handlers.onStatus("idle");
  }

  private helloMessage(): ClientMessage {
    const session = loadSession();
    return { type: "hello", name: this.name, ...session };
  }

  private open(status: ConnectionStatus): void {
    this.handlers.onStatus(status);
    this.helloDone = false;
    this.samples = [];
    this.pingSentAt.clear();
    const ws = new WebSocket(wsUrl(window.location));
    this.ws = ws;

    ws.addEventListener("open", () => {
      for (let i = 0; i < PING_SAMPLES; i++) {
        const t = Date.now() + i / 1000;
        this.pingSentAt.set(t, Date.now());
        this.sendNow({ type: "ping", t });
      }
      this.sendNow(this.helloMessage());
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      if (typeof msg !== "object" || typeof msg.type !== "string") return;
      this.receive(msg);
    });

    ws.addEventListener("close", (event) => {
      if (this.ws !== ws) return;
      this.ws = undefined;
      this.helloDone = false;
      if (this.closedByUser || NO_RECONNECT_CODES.has(event.code)) {
        this.handlers.onStatus("idle");
        return;
      }
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    const delay =
      RECONNECT_DELAYS[
        Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)
      ] ?? 4000;
    this.reconnectAttempt++;
    this.handlers.onStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => this.open("reconnecting"), delay);
  }

  private receive(msg: ServerMessage): void {
    if (msg.type === "pong") {
      const sentAt = this.pingSentAt.get(msg.t);
      if (sentAt === undefined) return;
      this.pingSentAt.delete(msg.t);
      this.samples.push({
        sentAt,
        serverNow: msg.serverNow,
        receivedAt: Date.now(),
      });
      this.offset = computeClockOffset(this.samples);
      return;
    }
    if (msg.type === "welcome") {
      saveSession({ playerId: msg.playerId, sessionToken: msg.sessionToken });
      this.helloDone = true;
      this.reconnectAttempt = 0;
      this.handlers.onStatus("open");
      const queued = this.queue;
      this.queue = [];
      for (const q of queued) this.sendNow(q);
    }
    this.handlers.onMessage(msg);
  }

  private sendNow(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
