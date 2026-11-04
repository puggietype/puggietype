/**
 * Tip destinations. Both stay empty until the Ko-fi and GitHub Sponsors
 * accounts exist. Empty means the footer, the about sections, and the static
 * pages render no support UI. Edit this object only — static HTML reads it
 * through the `__KOFI_URL__` / `__SPONSORS_URL__` tokens.
 */
export const SUPPORT_LINKS = {
  KOFI_URL: "",
  SPONSORS_URL: "",
} as const;

export type SupportLinkConfig = {
  KOFI_URL: string;
  SPONSORS_URL: string;
};

/** Both URLs must be non-empty. A half-set pair stays hidden. */
export function supportLinksEnabled(
  links: SupportLinkConfig = SUPPORT_LINKS,
): boolean {
  return links.KOFI_URL.trim() !== "" && links.SPONSORS_URL.trim() !== "";
}
