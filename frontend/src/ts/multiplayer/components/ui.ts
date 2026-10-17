import type { PlayerColor } from "../protocol";

// static class names so tailwind picks them up
export const PLAYER_BG: Record<PlayerColor, string> = {
  opp1: "bg-opp1",
  opp2: "bg-opp2",
  opp3: "bg-opp3",
  opp4: "bg-opp4",
};

export const PLAYER_TEXT: Record<PlayerColor, string> = {
  opp1: "text-opp1",
  opp2: "text-opp2",
  opp3: "text-opp3",
  opp4: "text-opp4",
};

export function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

export const LANGUAGES = [
  "english",
  "english_1k",
  "english_5k",
  "english_10k",
  "spanish",
  "french",
  "german",
  "portuguese",
] as const;

export function settingsSummary(s: {
  mode: "time" | "words";
  mode2: number;
  punctuation: boolean;
  numbers: boolean;
  language: string;
}): string {
  const parts = [
    s.language.replace(/_/g, " "),
    s.mode === "time" ? `${s.mode2}s` : `${s.mode2} words`,
  ];
  if (s.punctuation) parts.push("punctuation");
  if (s.numbers) parts.push("numbers");
  return parts.join(" · ");
}

/** main-colour call to action that keeps Button's hover/focus behaviour */
export const PRIMARY_BUTTON =
  "[--themable-button-bg:var(--main-color)] [--themable-button-text:var(--bg-color)]";
