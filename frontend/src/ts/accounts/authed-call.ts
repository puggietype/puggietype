// Signed-in accounts API calls (settings sync, personal bests, export). Its
// own module so session.ts can import() settings-sync without a cycle.
import { ApiFailure } from "./api";
import { getAccountsConfig, missingAccountsConfig } from "./config";
import { accountsCopy } from "./strings";

type ApiCallOptions = { apiUrl: string; idToken: string };

/**
 * One accounts API call with the signed-in user's ID token. A 401 gets one
 * retry with a refreshed token; never more. Never throws.
 */
export async function callWithIdToken<R extends { ok: true } | ApiFailure>(
  run: (options: ApiCallOptions) => Promise<R>,
): Promise<R | ApiFailure> {
  const config = getAccountsConfig();
  const failed = (status: number, message: string): ApiFailure => ({
    ok: false,
    status,
    code: "",
    message,
  });
  if (missingAccountsConfig(config).length > 0) {
    return failed(0, accountsCopy.notConfigured);
  }
  try {
    const sdk = await import("./firebase-sdk");
    const user = await sdk.getRestoredUser(config.firebase);
    if (user === null) return failed(401, accountsCopy.sessionExpired);
    const apiUrl = config.apiUrl;
    const first = await run({
      apiUrl,
      idToken: await sdk.getUserIdToken(user),
    });
    if (first.ok || first.status !== 401) return first;
    return await run({
      apiUrl,
      idToken: await sdk.getUserIdToken(user, true),
    });
  } catch {
    return failed(0, accountsCopy.api.network);
  }
}
