import { describe, expect, it } from "vitest";

import {
  BOT_NAME_PATTERN,
  botCount,
  displayName,
  excludeBots,
  humanCount,
} from "../../src/ts/multiplayer/bots";

const human = { name: "ZippyPug42", isBot: false };
const bot = { name: "SnoozyPug07", isBot: true };
/** an older server: no isBot field */
const legacy: { name: string; isBot?: boolean } = { name: "BouncyPug11" };

describe("bots", () => {
  it("counts humans and bots apart", () => {
    const players = [human, bot, legacy, bot];
    expect(humanCount(players)).toBe(2);
    expect(botCount(players)).toBe(2);
    expect(humanCount([])).toBe(0);
    expect(botCount([human, legacy])).toBe(0);
  });

  it("excludeBots keeps only human results, in order", () => {
    const results = [
      { playerId: "b", wpm: 200, isBot: true },
      { playerId: "h1", wpm: 90, isBot: false },
      { playerId: "h2", wpm: 80 },
    ];
    expect(excludeBots(results).map((r) => r.playerId)).toEqual(["h1", "h2"]);
    // a human-only median can't be pulled by a bot
    const wpms = excludeBots(results).map((r) => r.wpm);
    expect(Math.max(...wpms)).toBe(90);
  });

  it("labels bot names with the robot badge only", () => {
    expect(displayName(bot)).toBe("🤖 Bot SnoozyPug07");
    expect(displayName(bot)).toContain("Bot");
    expect(displayName(human)).toBe("ZippyPug42");
    expect(displayName(legacy)).toBe("BouncyPug11");
  });

  it("BOT_NAME_PATTERN matches server bot names only", () => {
    expect("Pug Bot \u00B7 ~80 wpm").toMatch(BOT_NAME_PATTERN);
    expect("Pug Bot · ~120 wpm".match(BOT_NAME_PATTERN)?.[1]).toBe("120");
    expect("Pug Bot · ~8 wpm").not.toMatch(BOT_NAME_PATTERN);
    expect("Pug Bot · ~1000 wpm").not.toMatch(BOT_NAME_PATTERN);
    expect("Pug Bot · ~08 wpm").not.toMatch(BOT_NAME_PATTERN);
    expect("Pug Bot · 80 wpm").not.toMatch(BOT_NAME_PATTERN);
    expect("Pug Bot - 80 wpm").not.toMatch(BOT_NAME_PATTERN);
    expect("ZippyPug42").not.toMatch(BOT_NAME_PATTERN);
  });
});
