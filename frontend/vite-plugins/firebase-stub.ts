import path from "node:path";
import { Plugin } from "vite";

const FIREBASE_SDK_RE = /^firebase\/(app|auth)$/;

/**
 * Standalone builds swap the Firebase SDK for a stub. With accounts on, the
 * one module in `allowImporter` still gets the real SDK; it is only reached
 * through import(), so Firebase stays out of the first-load bundle.
 */
export function shouldStubFirebase(
  source: string,
  importer: string | undefined,
  allowImporter: string | undefined,
): boolean {
  if (!FIREBASE_SDK_RE.test(source)) return false;
  if (allowImporter === undefined || importer === undefined) return true;
  return path.resolve(importer.split("?")[0] ?? "") !== allowImporter;
}

export function firebaseStub(options: {
  stub: string;
  allowImporter: string | undefined;
}): Plugin {
  return {
    name: "firebase-stub",
    enforce: "pre",
    resolveId(source, importer) {
      return shouldStubFirebase(source, importer, options.allowImporter)
        ? options.stub
        : null;
    },
  };
}
