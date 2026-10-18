import { getUserAverage10Once } from "../collections/results";
import { claimedWpm } from "./quick-match";

/**
 * Our recent pace for queue:join: the average of the last 10 saved results
 * in the Quick Match bucket (time 30, english). Signed-in only; none for
 * guests or without results. Races never become saved results, so no bot
 * result can feed this.
 */
export async function recentClaimedWpm(): Promise<number | undefined> {
  try {
    const { wpm } = await getUserAverage10Once({
      mode: "time",
      mode2: "30",
      punctuation: false,
      numbers: false,
      language: "english",
      difficulty: "normal",
      lazyMode: false,
    });
    return claimedWpm(wpm);
  } catch {
    return undefined;
  }
}
