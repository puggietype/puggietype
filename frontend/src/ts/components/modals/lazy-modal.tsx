import {
  Component,
  createMemo,
  ErrorBoundary,
  lazy,
  Show,
  untrack,
} from "solid-js";

import {
  getModalVisibility,
  getPendingModal,
  hideModalAndClearChain,
  ModalId,
} from "../../states/modals";
import { showErrorNotification } from "../../states/notifications";

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
        <ErrorBoundary
          fallback={() => {
            // chunk failed to load: don't leave the store thinking it's open.
            // No reset: lazy() keeps the rejected import, so a retry would
            // just fail again (the preloadError handler reloads the page)
            untrack(() => {
              for (const id of ids) {
                if (getModalVisibility(id)?.visible === true) {
                  hideModalAndClearChain(id);
                }
              }
              showErrorNotification("Failed to load, please reload the page");
            });
            return null;
          }}
        >
          <Modal />
        </ErrorBoundary>
      </Show>
    );
  };
}
