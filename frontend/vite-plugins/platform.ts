export type BuildPlatform = "web" | "steam";

/**
 * The build flavor comes only from the shell environment of the build script
 * (e.g. `PLATFORM=steam npm run build`). It is never read from .env files,
 * so a stray .env line cannot turn a web deploy into a steam build.
 * Pass `process.env`, not the result of vite's loadEnv.
 */
export function resolvePlatform(
  shellEnv: Record<string, string | undefined>,
): BuildPlatform {
  const value = shellEnv["PLATFORM"];
  if (value === undefined || value === "" || value === "web") return "web";
  if (value === "steam") return "steam";
  throw new Error(`PLATFORM must be "web" or "steam", got "${value}"`);
}
