import type { FirebaseOptions } from "firebase/app";
import { isDevEnvironment } from "../utils/env";

// glob so the gitignored config files are optional (standalone builds have none)
const configs = import.meta.glob<{ firebaseConfig: FirebaseOptions }>([
  "./firebase-config.ts",
  "./firebase-config-live.ts",
]);

/** @returns the firebase config, or undefined when none is bundled */
export async function loadFirebaseConfig(): Promise<
  FirebaseOptions | undefined
> {
  const load = isDevEnvironment()
    ? configs["./firebase-config.ts"]
    : configs["./firebase-config-live.ts"];
  return (await load?.())?.firebaseConfig;
}
