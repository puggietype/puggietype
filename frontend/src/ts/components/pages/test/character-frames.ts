import {
  CHARACTERS,
  CharacterSchema,
  DEFAULT_CHARACTER,
  type Character,
} from "../../../multiplayer/protocol";
import { normalizePugSvg, type PugFrame } from "./pug-frames";

export { CHARACTERS, DEFAULT_CHARACTER, type Character };

/**
 * Dog frames: static/images/characters/<id>/<id>-<file>.svg (see the README
 * there). Keys match the pug frame names so Pug.tsx can swap dogs; `head` is
 * the idle frame cropped to the head (served from the idle file, so lists cost
 * no extra download).
 */
export const CHARACTER_FRAME_FILES = {
  idle: "idle",
  blink: "blink",
  left: "left-paw-down",
  right: "right-paw-down",
  both: "both-down",
  leftHalf: "left-paw-half",
  rightHalf: "right-paw-half",
  winner: "winner",
  winnerSmall: "winner-small",
} as const satisfies Record<PugFrame | "winner" | "winnerSmall", string>;

export type CharacterFrame = keyof typeof CHARACTER_FRAME_FILES;
export type CharacterImageFrame = CharacterFrame | "head";

/** must match HEAD_VIEWBOX in scripts/character-svg.mjs */
export const HEAD_VIEWBOX = "76 -2 360 288";

export const CHARACTER_INFO: Record<
  Character,
  { name: string; breed: string }
> = {
  puggie: { name: "Puggie", breed: "pug" },
  chowie: { name: "Chowie", breed: "chow chow" },
  frenchie: { name: "Frenchie", breed: "French bulldog" },
  tuckie: { name: "Tuckie", breed: "maltipoo" },
  huskie: { name: "Huskie", breed: "Siberian husky" },
  corgie: { name: "Corgie", breed: "Pembroke corgi" },
  shibie: { name: "Shibie", breed: "shiba inu" },
  goldie: { name: "Goldie", breed: "golden retriever" },
};

/** accessible name, e.g. "Chowie, chow chow" */
export function characterLabel(character: Character): string {
  const info = CHARACTER_INFO[character];
  return `${info.name}, ${info.breed}`;
}

export function characterName(character: Character): string {
  return CHARACTER_INFO[character].name;
}

/** anything that isn't a known dog becomes puggie */
export function toCharacter(value: unknown): Character {
  const parsed = CharacterSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_CHARACTER;
}

export function getCharacterFrameUrl(
  character: Character,
  frame: CharacterImageFrame,
): string {
  const file = CHARACTER_FRAME_FILES[frame === "head" ? "idle" : frame];
  return `/images/characters/${character}/${character}-${file}.svg`;
}

/** idle markup -> head crop */
export function toHeadSvg(svg: string): string {
  return svg.replace(/^<svg([^>]*?)\sviewBox="[^"]*"/, (_m, attrs: string) => {
    return `<svg${attrs} viewBox="${HEAD_VIEWBOX}"`;
  });
}

const cache = new Map<string, Promise<string | undefined>>();
let nextId = 0;

async function load(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url);
    if (response.ok) return await response.text();
  } catch {
    // offline or blocked: fall through
  }
  // let a failed load retry later
  cache.delete(url);
  return undefined;
}

async function fetchSvg(url: string): Promise<string | undefined> {
  let pending = cache.get(url);
  if (pending === undefined) {
    pending = load(url);
    cache.set(url, pending);
  }
  return pending;
}

/**
 * One frame, ready to inline (theme colours apply): fetched once per url and
 * cached, sanitised, ids prefixed per call so several copies can coexist.
 */
export async function loadCharacterSvg(
  character: Character,
  frame: CharacterImageFrame,
): Promise<string | undefined> {
  const raw = await fetchSvg(getCharacterFrameUrl(character, frame));
  if (raw === undefined) return undefined;
  const svg = normalizePugSvg(raw, `dog${nextId++}-`);
  if (svg === undefined) return undefined;
  return frame === "head" ? toHeadSvg(svg) : svg;
}

/** warm the cache for these dogs' frames (e.g. everyone in the lobby) */
export function prefetchCharacters(
  characters: Iterable<Character>,
  frames: readonly CharacterImageFrame[],
): void {
  for (const c of new Set(characters)) {
    for (const f of frames) void fetchSvg(getCharacterFrameUrl(c, f));
  }
}
