const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export type TurnstileRenderOptions = {
  sitekey: string;
  action?: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
};

export type TurnstileApi = {
  render: (el: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

let loading: Promise<TurnstileApi> | undefined;

function getTurnstile(): TurnstileApi | undefined {
  return (window as { turnstile?: TurnstileApi }).turnstile;
}

/** injects the Turnstile script once, only when a form needs it */
export async function loadTurnstile(): Promise<TurnstileApi> {
  const existing = getTurnstile();
  if (existing !== undefined) return existing;
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      const api = getTurnstile();
      if (api === undefined) reject(new Error("turnstile missing after load"));
      else resolve(api);
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(script);
  }).catch((e: unknown) => {
    // allow a retry on the next form mount
    loading = undefined;
    throw e;
  });
  return loading;
}
