import { Component, createMemo, lazy, Show } from "solid-js";

import {
  getModalVisibility,
  getPendingModal,
  ModalId,
} from "../../states/modals";

/**
 * Loads and mounts a modal the first time one of its ids is requested, then
 * keeps it mounted. AnimatedModal opens on mount when its id is already
 * visible, so the first show works the same as later ones. Keeps forms,
 * tables and their libraries out of the boot bundle.
 */
export function lazyModal<T extends Record<string, unknown>>(
  ids: ModalId[],
  load: () => Promise<T>,
  name: keyof T,
): Component {
  const Modal = lazy(async () =>
    load().then((m) => ({ default: m[name] as Component })),
  );
  return () => {
    const requested = createMemo(
      (was: boolean) =>
        was ||
        ids.some(
          (id) => getModalVisibility(id) !== null || getPendingModal() === id,
        ),
      false,
    );
    return (
      <Show when={requested()}>
        <Modal />
      </Show>
    );
  };
}
