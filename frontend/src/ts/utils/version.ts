import { envConfig } from "virtual:env-config";
import { z } from "zod";
import { LocalStorageWithSchema } from "./local-storage-with-schema";
import { isDevEnvironment } from "./env";

const memoryLS = new LocalStorageWithSchema({
  key: "lastSeenVersion",
  schema: z.string(),
  fallback: "",
});

function purgeCaches(): void {
  if (!("caches" in window)) return;
  void caches.keys().then(function (names) {
    for (const name of names) void caches.delete(name);
  });
}

/** the version baked in at build time (no network request) */
export function getBuildVersion(): {
  text: string;
  isNew: boolean;
} | null {
  if (isDevEnvironment()) return null;

  const currentVersion = envConfig.clientVersion;
  const memoryVersion = memoryLS.get();
  const isNew = memoryVersion === "" ? false : memoryVersion !== currentVersion;

  if (isNew || memoryVersion === "") {
    memoryLS.set(currentVersion);
    purgeCaches();
  }

  return {
    text: currentVersion,
    isNew,
  };
}
