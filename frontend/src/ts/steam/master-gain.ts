import type { SteamSettings } from "./settings-store";

/**
 * Steam master volume for every Web Audio sound. Installed synchronously by
 * ./early-audio (the first import of index.tsx), before any module can
 * create an AudioContext; game-settings loads later and only updates the
 * gain. No side effects at module level.
 */
const masterGains = new Set<GainNode>();
let masterVolume = 1;
const wrapped = new WeakSet<object>();

/** Web Audio gain: master × sound effects, 0 while muted */
export function sfxGain(s: SteamSettings): number {
  return s.muted ? 0 : s.masterVolume * s.sfxVolume;
}

/**
 * Each AudioContext created after this (Howler's and the synthesized
 * click/error tones) routes its destination through one master GainNode.
 * HTML audio (the music) applies the master volume itself. Idempotent.
 */
export function installMasterGain(
  target: { AudioContext?: typeof AudioContext },
  initial?: number,
): void {
  if (initial !== undefined) masterVolume = initial;
  const Native = target.AudioContext;
  if (Native === undefined || wrapped.has(Native)) return;
  class MasterAudioContext extends Native {
    readonly #master: GainNode;
    constructor(options?: AudioContextOptions) {
      super(options);
      this.#master = this.createGain();
      this.#master.gain.value = masterVolume;
      this.#master.connect(super.destination);
      masterGains.add(this.#master);
    }
    // oxlint-disable-next-line typescript/class-literal-property-style -- forwards to the master gain
    override get destination(): AudioDestinationNode {
      return this.#master as unknown as AudioDestinationNode;
    }
  }
  wrapped.add(MasterAudioContext);
  target.AudioContext = MasterAudioContext;
}

export function applyMasterVolume(volume: number): void {
  masterVolume = volume;
  for (const g of masterGains) g.gain.value = volume;
}
