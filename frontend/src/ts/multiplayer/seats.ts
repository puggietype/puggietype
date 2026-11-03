import { createMemo, type Accessor } from "solid-js";

import type { PlayerState } from "./protocol";

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * The players' ids, unchanged while the line-up is. Every room:state replaces
 * each player object, so a <For> over the objects rebuilds every row (dog svgs
 * included) on each one, e.g. right when the countdown ends. Key rows by id
 * and read the player through createSeat.
 */
export function createPlayerIds(
  players: Accessor<readonly PlayerState[]>,
): Accessor<string[]> {
  return createMemo(() => players().map((p) => p.id), [], {
    equals: sameIds,
  });
}

/** the latest object for a keyed row's player; the last one while it leaves */
export function createSeat(
  id: string,
  players: Accessor<readonly PlayerState[]>,
): Accessor<PlayerState | undefined> {
  return createMemo<PlayerState | undefined>(
    (prev) => players().find((p) => p.id === id) ?? prev,
  );
}
