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
export async function deleteConfig(): Promise<void> {
  if (isAuthenticated()) {
    const response = await Ape.configs.delete();
    if (response.status !== 200) {
      showErrorNotification("Failed to reset config", { response });
    }
  }
}
