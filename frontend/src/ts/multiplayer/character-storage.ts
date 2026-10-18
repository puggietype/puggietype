import { CharacterSchema, DEFAULT_CHARACTER, type Character } from "./protocol";

export const CHARACTER_KEY = "puggie-mp-character";

/** the saved dog pick (localStorage), puggie if unset or unknown */
export function loadCharacter(
  storage: Pick<Storage, "getItem"> = localStorage,
): Character {
  const parsed = CharacterSchema.safeParse(storage.getItem(CHARACTER_KEY));
  return parsed.success ? parsed.data : DEFAULT_CHARACTER;
}

export function saveCharacter(
  character: Character,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(CHARACTER_KEY, character);
}
