import { createSignal, JSXElement, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";

import { SteamGraphicsSettings } from "../../../steam/SteamGraphicsSettings";
import { SteamSoundSettings } from "../../../steam/SteamSoundSettings";
import { settingsPanelDomId } from "./settings-tabs";
import { SettingsPage as BaseSettingsPage } from "./SettingsPage";

/**
 * Steam flavor's settings page: the shared page plus the steam-only
 * Graphics (display) and Sound (music, master volume) groups, appended to
 * the end of their tab panels. page-registry picks this module only on the
 * steam build, so the web settings page is untouched.
 */
export function SettingsPage(): JSXElement {
  const [panels, setPanels] = createSignal<
    { graphics: HTMLElement; sound: HTMLElement } | undefined
  >();
  onMount(() => {
    const graphics = document.getElementById(settingsPanelDomId("graphics"));
    const sound = document.getElementById(settingsPanelDomId("sound"));
    if (graphics && sound) setPanels({ graphics, sound });
  });
  return (
    <>
      <BaseSettingsPage />
      <Show when={panels()}>
        {(p) => (
          <>
            <Portal mount={p().graphics}>
              <SteamGraphicsSettings />
            </Portal>
            <Portal mount={p().sound}>
              <SteamSoundSettings />
            </Portal>
          </>
        )}
      </Show>
    </>
  );
}
