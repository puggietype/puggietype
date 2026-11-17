/**
 * Kids guide paths that get the GA-free CSP (vite-plugins/pages-headers.ts)
 * and that functions/_middleware.ts canonicalizes. No imports: the Pages
 * middleware bundles this file. Must stay in step with KIDS_GUIDE_PATH /
 * TEACHING_KIDS_GUIDE_PATH and the kids 301s in static/_redirects.
 */

/** where every kids path ends up (static/_redirects 301s the others here) */
export const KIDS_CANONICAL_PATH = "/guide/teaching-kids-to-type";

/** the parents guide, the old slug that 301s to it, and both trailing-slash forms */
export const KIDS_CSP_PATHS = [
  KIDS_CANONICAL_PATH,
  "/guide/teaching-kids-to-type/",
  "/guide/typing-for-kids",
  "/guide/typing-for-kids/",
] as const;
