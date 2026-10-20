import { showNoticeNotification } from "../states/notifications";
import type { AdProvider } from "./provider";

/**
 * VITE_ADS_PROVIDER=placeholder: a grey dashed box per slot and no network
 * requests at all. For dev, tests and screenshots, never production.
 */
export const placeholderAdProvider: AdProvider = {
  name: "placeholder",
  prepare: async () => true,
  render: (slot, spec) => {
    if (slot.childElementCount > 0) return;
    const box = document.createElement("div");
    box.className = "ptAdPlaceholder";
    box.dataset["adSlotId"] = spec.slotId;
    box.textContent = `Ad placeholder ${spec.width}×${spec.height}`;
    slot.appendChild(box);
  },
  destroy: (slot) => {
    slot.replaceChildren();
  },
  openPrivacySettings: () => {
    showNoticeNotification("Placeholder ads: there is no consent message.");
  },
};
