import { hasSessionHint } from "./flag";

/** boot (accounts on): Firebase only loads for a returning signed-in user */
export async function initAccounts(): Promise<void> {
  if (!hasSessionHint(localStorage)) return;
  const { restoreSession } = await import("./session");
  await restoreSession();
}
