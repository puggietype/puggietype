import { z } from "zod";

import { BOT_BADGE } from "./bots";
import {
  MAX_PLAYERS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SettingsSchema,
  type OpenRoomEntry,
  type RoomAge,
} from "./protocol";

const count = z.number().int().min(0).max(1000);

/**
 * A `rooms:list` entry as the client accepts it. Unknown keys are stripped,
 * so nothing beyond counts and settings (e.g. a nickname) can reach the UI.
 */
const OpenRoomEntrySchema = z.object({
  code: z
    .string()
    .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`)),
  settings: SettingsSchema,
  humans: count,
  bots: count.catch(0),
  maxPlayers: count.catch(MAX_PLAYERS),
  phase: z.enum(["lobby", "countdown", "racing", "results"]),
  createdAgo: z.enum(["lt1m", "lt5m", "lt15m", "lt1h", "gte1h"]),
});

export type RoomsList = { rooms: OpenRoomEntry[]; racing: number };

/** validate a pushed list: bad entries are dropped, not the whole list */
export function parseRoomsList(msg: {
  rooms?: unknown;
  racing?: unknown;
}): RoomsList {
  const rooms = Array.isArray(msg.rooms) ? msg.rooms : [];
  const racing = count.safeParse(msg.racing);
  return {
    rooms: rooms.flatMap((r) => {
      const parsed = OpenRoomEntrySchema.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    }),
    racing: racing.success ? racing.data : 0,
  };
}

const AGE_TEXT: Record<RoomAge, string> = {
  lt1m: "just opened",
  lt5m: "< 5 min",
  lt15m: "< 15 min",
  lt1h: "< 1 hour",
  gte1h: "1 hour+",
};

export function roomAgeText(age: RoomAge): string {
  return AGE_TEXT[age];
}

/** "3/8": humans only, bots never count here */
export function humansText(room: OpenRoomEntry): string {
  return `${room.humans}/${room.maxPlayers}`;
}

/** "🤖 2", or undefined with no bots */
export function botsText(room: OpenRoomEntry): string | undefined {
  return room.bots > 0 ? `${BOT_BADGE} ${room.bots}` : undefined;
}

/** "3 open rooms · 5 racing now" for the live region */
export function openRoomsStatus(list: RoomsList): string {
  const n = list.rooms.length;
  const rooms = `${n} open ${n === 1 ? "room" : "rooms"}`;
  return list.racing > 0 ? `${rooms} · ${list.racing} racing now` : rooms;
}
