import { mapRange } from "@monkeytype/util/numbers";

/**
 * "Fast pug" trigger, ported from Monkeytype's Monkey.tsx (same thresholds):
 * the live wpm (raw in blind mode) maps linearly from 130 to 180 onto
 * 0..1 for the red "_fast" layer's opacity, and onto 0.25s..0.01s for the
 * shake, where 0.25s (at or below 130) means no shake at all.
 */
export const FAST_MIN_WPM = 130;
export const FAST_MAX_WPM = 180;

const HALF_FRAME_MS = 45;
const HALF_FRAME_FAST_MS = 22;

export function getPugSpeed(
  stats: { wpm?: number; raw?: number },
  blindMode: boolean,
): number {
  return (blindMode ? stats.raw : stats.wpm) ?? 0;
}

/** 0 at or below 130 wpm, 1 at or above 180, linear between */
export function getPugHeat(wpm: number): number {
  if (!Number.isFinite(wpm)) return 0;
  return mapRange(wpm, FAST_MIN_WPM, FAST_MAX_WPM, 0, 1);
}

/** seconds per shake cycle; 0 disables the shake (Monkeytype behaviour) */
export function getShakeDuration(wpm: number): number {
  if (!Number.isFinite(wpm)) return 0;
  const duration = mapRange(wpm, FAST_MIN_WPM, FAST_MAX_WPM, 0.25, 0.01);
  return duration === 0.25 ? 0 : duration;
}

/** half-raised paw frame gets shorter as the pug heats up: quicker paws */
export function getHalfFrameMs(heat: number): number {
  const h = Math.min(Math.max(Number.isFinite(heat) ? heat : 0, 0), 1);
  return Math.round(HALF_FRAME_MS - (HALF_FRAME_MS - HALF_FRAME_FAST_MS) * h);
}

/** steam only runs once the pug is visibly warm, so it costs nothing below */
export function isSteaming(heat: number): boolean {
  return heat >= 0.15;
}
