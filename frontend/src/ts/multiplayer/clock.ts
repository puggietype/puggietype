export type ClockSample = {
  /** local Date.now() when the ping was sent */
  sentAt: number;
  /** server epoch ms from the pong */
  serverNow: number;
  /** local Date.now() when the pong arrived */
  receivedAt: number;
};

/**
 * Offset to add to Date.now() to get server time, from the sample with the
 * median round trip (NTP style, the server stamp is assumed mid-trip).
 */
export function computeClockOffset(samples: ClockSample[]): number {
  const valid = samples
    .map((s) => ({ ...s, rtt: s.receivedAt - s.sentAt }))
    .filter((s) => s.rtt >= 0)
    .sort((a, b) => a.rtt - b.rtt);
  const median = valid[Math.floor((valid.length - 1) / 2)];
  if (median === undefined) return 0;
  return median.serverNow + median.rtt / 2 - median.receivedAt;
}

/** whole seconds left until startAt, 0 once started */
export function countdownSeconds(serverNow: number, startAt: number): number {
  return Math.max(0, Math.ceil((startAt - serverNow) / 1000));
}
