import { Config } from "@monkeytype/schemas/configs";
import { isAuthenticated } from "../states/core";
import { showErrorNotification } from "../states/notifications";
import Ape from ".";

/** resolves true only when the server accepted the save */
export async function saveConfig(config: Partial<Config>): Promise<boolean> {
  if (!isAuthenticated()) return false;
  const response = await Ape.configs.save({ body: config });
  if (response.status !== 200) {
    showErrorNotification("Failed to save config", { response });
    return false;
  }
  return true;
}

/** background save with no toast; resolves to the HTTP status (0 = not sent) */
export async function saveConfigSilently(
  config: Partial<Config>,
): Promise<number> {
  if (!isAuthenticated()) return 0;
  const response = await Ape.configs.save({ body: config });
  return response.status;
}

export async function deleteConfig(): Promise<void> {
  if (isAuthenticated()) {
    const response = await Ape.configs.delete();
    if (response.status !== 200) {
      showErrorNotification("Failed to reset config", { response });
    }
  }
}
