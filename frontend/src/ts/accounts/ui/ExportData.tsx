import { createSignal, JSXElement, Show } from "solid-js";

import { Button } from "../../components/common/Button";
import { exportMyData } from "../api";
import { callWithIdToken } from "../session";
import { accountsCopy } from "../strings";

/** hands `data` to the browser as a JSON download */
function saveJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // after the click has handed the file over (Safari needs the tick)
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** "Download my data": GET /v1/me/export saved as a JSON file */
export function ExportData(): JSXElement {
  const copy = accountsCopy.exportData;
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const download = async (): Promise<void> => {
    if (busy()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await callWithIdToken(exportMyData);
      if (result.ok) saveJson(result.data, copy.fileName);
      else setError(result.message);
    } catch {
      setError(accountsCopy.api.badResponse);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="grid gap-2">
      <Button
        text={busy() ? copy.busy : copy.button}
        fa={{ icon: "fa-download" }}
        onClick={() => void download()}
        disabled={busy()}
      />
      <Show when={error()}>
        {(message) => (
          <p class="text-error" role="alert">
            {message()}
          </p>
        )}
      </Show>
    </div>
  );
}
