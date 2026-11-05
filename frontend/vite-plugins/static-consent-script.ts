import { Plugin } from "vite";

/** Kids guide HTML must not reference the analytics boot or GA4 chunks. */
const KIDS_HTML = ["typing-for-kids.html", "teaching-kids-to-type.html"];

export const STATIC_CONSENT_SCRIPT =
  '<script type="module" src="/ts/analytics/static-boot.ts"></script>';

const SCRIPT_RE =
  /<script type="module" src="\/ts\/analytics\/static-boot\.ts"><\/script>\s*/g;

const SETTINGS_BUTTON_RE =
  /<button\b[^>]*\bdata-consent-settings\b[^>]*>[\s\S]*?<\/button>\s*/g;

/** Sets the session flag only. It does not load GA or the consent boot. */
export const KIDS_FLOW_INLINE_SCRIPT =
  '<script>try{sessionStorage.setItem("puggie-kids-flow","1")}catch(e){}</script>';

export function injectStaticConsentScript(
  html: string,
  filename: string,
): string {
  const base = filename.replaceAll("\\", "/").split("/").pop() ?? "";
  if (KIDS_HTML.includes(base)) {
    let out = html.replace(SCRIPT_RE, "").replace(SETTINGS_BUTTON_RE, "");
    if (!out.includes("puggie-kids-flow")) {
      out = out.replace("</head>", `    ${KIDS_FLOW_INLINE_SCRIPT}\n  </head>`);
    }
    return out;
  }
  if (!html.includes("data-consent-settings")) return html;
  if (html.includes("/ts/analytics/static-boot.ts")) return html;
  return html.replace("</body>", `    ${STATIC_CONSENT_SCRIPT}\n  </body>`);
}

/** Adds the consent boot script to static pages. Kids guide HTML is left out. */
export function staticConsentScript(): Plugin {
  return {
    name: "static-consent-script",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        return injectStaticConsentScript(html, ctx.filename);
      },
    },
  };
}
