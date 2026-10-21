import { isAnyPopupVisible } from "../../utils/misc";

import { navigate } from "../../controllers/route-controller";
import { restartTestEvent } from "../../events/test";
import { getActivePage } from "../../states/core";
import { hotkeys, quickRestartHotkeyMap } from "../../states/hotkeys";
import { createHotkey } from "./utils";
import { getConfig } from "../../config/store";
import { isLongTest, wordsHaveNewline, wordsHaveTab } from "../../states/test";
import { isRaceRestartLocked } from "../../multiplayer/engine-hooks";

function quickRestart(e: KeyboardEvent): void {
  if (isAnyPopupVisible()) {
    return;
  }

  // multiplayer hook: the restart key does nothing mid-race
  if (isRaceRestartLocked()) {
    e.preventDefault();
    return;
  }

  e.preventDefault();

  if (getActivePage() === "test") {
    restartTestEvent.dispatch({ isQuickRestart: !e.shiftKey });
  } else {
    void navigate("");
  }
}

// Disable restart when we're in long test and quick restart key is enter, because `shift + enter, shift +
// enter` is already reserved for bail out keybind.
createHotkey(
  () => hotkeys.quickRestart,
  quickRestart,
  () => ({ enabled: !isLongTest() || getConfig.quickRestart !== "enter" }),
);

// We also want to have a hotkey for quick restart key without shift, so when the
// test is considered long (which means that we can't quick restart), we show a
// notification when the user tries to press the quick restart key without shift,
// and we'll restart when it's pressed with shift.
createHotkey(
  () => quickRestartHotkeyMap[getConfig.quickRestart],
  quickRestart,
  () => ({
    enabled:
      isLongTest() &&
      !(wordsHaveTab() && getConfig.quickRestart === "tab") &&
      !(wordsHaveNewline() && getConfig.quickRestart === "enter"),
  }),
);

/**
 * multiplayer hook: mid-race Tab must not move focus either, or Tab > Enter
 * would reach a restart or leave control (logo, nav). Popups keep Tab.
 */
export function blockRaceTab(e: KeyboardEvent): void {
  if (e.key !== "Tab" || !isRaceRestartLocked() || isAnyPopupVisible()) return;
  e.preventDefault();
}

document.addEventListener("keydown", blockRaceTab, { capture: true });
