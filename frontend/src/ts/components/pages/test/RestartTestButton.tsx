import { JSXElement, Show } from "solid-js";

import { getConfig } from "../../../config/store";
import { isRaceRestartLocked } from "../../../multiplayer/engine-hooks";
import { getFocus } from "../../../states/test";
import { onRestartButtonClick } from "../../../test/test-logic";
import { cn } from "../../../utils/cn";
import { Button } from "../../common/Button";

export function RestartTestButton(): JSXElement {
  return (
    // multiplayer hook: no restart button (or Tab stop) mid-race
    <Show when={!isRaceRestartLocked()}>
      <Button
        variant="text"
        dataset={{ "data-ui-element": "restartTestButton" }}
        class={cn(
          "mx-auto mt-4 w-max px-8 py-4 text-base transition-opacity",
          "focus:opacity-100 focus:transition-none",
          getConfig.quickRestart !== "off" && "hidden",
          "pointer-coarse:block", //always show the button if using a pointer-coarse device
          getFocus() && "opacity-0", //always hide if we are focused
        )}
        balloon={{
          text: "Restart Test",
          position: "down",
        }}
        fa={{
          icon: "fa-redo-alt",
          fixedWidth: true,
        }}
        onClick={onRestartButtonClick}
      />
    </Show>
  );
}
