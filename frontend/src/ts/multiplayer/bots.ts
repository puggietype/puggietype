/**
 * Quick Match groundwork: server-side bots are always marked `isBot`. Public
 * counts are humans only, stats skip bots, and bot names always get a badge.
 * Older servers omit `isBot`, which means human.
 */

type MaybeBot = { isBot?: boolean };

export const BOT_BADGE = "🤖";
export const BOT_LABEL = "Bot";
export const BOT_LABEL_ARIA = "Bot: computer-controlled player";

/** mirrors the server: bot names are "Pug Bot · NN wpm" */
export const BOT_NAME_PATTERN = /^Pug Bot \u00B7 ([1-9]\d{1,2}) wpm$/;

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

/** plain-text name (aria, titles): bots carry "🤖 Bot"; JSX uses PlayerName */
export function displayName(p: MaybeBot & { name: string }): string {
  return isBot(p) ? `${BOT_BADGE} ${BOT_LABEL} ${p.name}` : p.name;
}

/** "2 humans · 🤖 3 bots" for a room with bots, undefined without */
export function botMixText(players: readonly MaybeBot[]): string | undefined {
  const bots = botCount(players);
  if (bots === 0) return undefined;
  const humans = humanCount(players);
  return `${humans} ${humans === 1 ? "human" : "humans"} · ${BOT_BADGE} ${bots} ${bots === 1 ? "bot" : "bots"}`;
}
