import { z } from "zod";
import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";
import { claimedWpm } from "./quick-match";

/** queue:join pace when there are no local records */
export const DEFAULT_CLAIMED_WPM = 50;
const MAX_RECORDS = 10;

const PaceRecordSchema = z.object({
  wpm: z.number().nonnegative(),
  mode: z.string(),
  mode2: z.string(),
  language: z.string(),
});
export type PaceRecord = z.infer<typeof PaceRecordSchema>;

/**
 * Minimal local history of solo test paces, newest last. No timestamps,
 * text or ids: only what the Quick Match pace needs.
 */
const recentPaceLS = new LocalStorageWithSchema({
  key: "puggie-mp-recent-pace",
  schema: z.array(PaceRecordSchema).max(MAX_RECORDS),
  fallback: [],
});

/** called by test-logic finish() for each valid solo test */
export function recordSoloPace(record: PaceRecord): void {
  const { wpm, mode, mode2, language } = record;
  recentPaceLS.set(
    [...recentPaceLS.get(), { wpm, mode, mode2, language }].slice(-MAX_RECORDS),
  );
}

/**
 * Our pace for queue:join: the average of the last 10 local records,
 * preferring time 30 english ones, else any local records, else 50. Local
 * only, never account/server results. Races never reach recordSoloPace, so
 * no race or bot result can feed this.
 */
export async function recentClaimedWpm(): Promise<number> {
  const records = recentPaceLS.get();
  const qm = records.filter(
    (r) => r.mode === "time" && r.mode2 === "30" && r.language === "english",
  );
  const pool = qm.length > 0 ? qm : records;
  if (pool.length === 0) return DEFAULT_CLAIMED_WPM;
  const avg = pool.reduce((sum, r) => sum + r.wpm, 0) / pool.length;
  return claimedWpm(avg) ?? DEFAULT_CLAIMED_WPM;
}
