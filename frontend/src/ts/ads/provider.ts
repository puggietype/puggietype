/**
 * Ad provider hook. No ad network is wired: the default provider does
 * nothing. A future provider (e.g. AdSense) may only fill the
 * results-screen slot, and only when the `ads` config is not "off".
 */
export type AdProvider = {
  readonly name: string;
  /** Fill the results-screen ad slot. */
  renderResult: (slot: HTMLElement) => void | Promise<void>;
  /** Clear anything `renderResult` added to the slot. */
  destroyResult: (slot: HTMLElement) => void;
};

export const noopAdProvider: AdProvider = {
  name: "none",
  renderResult: () => undefined,
  destroyResult: () => undefined,
};

let provider: AdProvider = noopAdProvider;

export function getAdProvider(): AdProvider {
  return provider;
}

export function setAdProvider(next: AdProvider): void {
  provider = next;
}
