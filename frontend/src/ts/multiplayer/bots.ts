/**
 * Quick Match groundwork: server-side bots are always marked `isBot`. Public
 * counts are humans only, stats skip bots, and bot names always get a badge.
 * Older servers omit `isBot`, which means human.
 */

type MaybeBot = { isBot?: boolean };

export const BOT_BADGE = "🤖";

export function isBot(p: MaybeBot): boolean {
  return p.isBot === true;
}

export function humanCount(players: readonly MaybeBot[]): number {
  return players.filter((p) => !isBot(p)).length;
}

export function botCount(players: readonly MaybeBot[]): number {
  return players.filter(isBot).length;
}

/** results that may feed PBs, history or medians: never a bot's */
export function excludeBots<T extends MaybeBot>(results: readonly T[]): T[] {
  return results.filter((r) => !isBot(r));
}

/** a player's name as shown anywhere: bots carry the badge */
export function displayName(p: MaybeBot & { name: string }): string {
  return isBot(p) ? `${BOT_BADGE} ${p.name}` : p.name;
}
