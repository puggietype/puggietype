/**
 * Ad provider hook. The default provider does nothing. A real provider is
 * only loaded (dynamic import, see ads/state.ts) when both ad switches are
 * on, and only fills the slots the AdSlot component renders.
 */
export type AdSlotKind = "result" | "rail" | "lobby" | "info";

export type AdSlotSpec = {
  kind: AdSlotKind;
  width: number;
  height: number;
  /** the ad unit id */
  slotId: string;
};

export type AdPrepareOptions = {
  /**
   * May show the consent message. False on the test page (rails): only
   * waits for a prepare started elsewhere, resolving false if there is none.
   */
  consentUi: boolean;
};

export type AdProvider = {
  readonly name: string;
  /** Consent gate and ad script, once. False: no ads may be shown. */
  prepare: (options: AdPrepareOptions) => Promise<boolean>;
  /** Request one ad into an empty, visible slot. Never refreshes. */
  render: (slot: HTMLElement, spec: AdSlotSpec) => void;
  /** Remove anything `render` added to the slot. */
  destroy: (slot: HTMLElement) => void;
  /** Footer "Privacy and cookie settings": reopen the consent message. */
  openPrivacySettings: () => void;
};

export const noopAdProvider: AdProvider = {
  name: "none",
  prepare: async () => false,
  render: () => undefined,
  destroy: () => undefined,
  openPrivacySettings: () => undefined,
};

let provider: AdProvider = noopAdProvider;

export function getAdProvider(): AdProvider {
  return provider;
}

export function setAdProvider(next: AdProvider): void {
  provider = next;
}
