import { describe, expect, it } from "vitest";

import { inlineStaticCss } from "../../vite-plugins/inline-static-css";

describe("inlineStaticCss", () => {
  const css = (href: string): string => `/*${href}*/body{margin:0}\n`;

  it("inlines the static-page stylesheet", () => {
    const html =
      '<head><link rel="stylesheet" crossorigin href="/css/static-page.6b5H18Rx.css"></head>';
    expect(inlineStaticCss(html, css)).toBe(
      "<head><style>/*/css/static-page.6b5H18Rx.css*/body{margin:0}</style></head>",
    );
  });

  it("leaves other stylesheets alone", () => {
    const html =
      '<link rel="stylesheet" crossorigin href="/css/puggietype.B8Gx7oxZ.css">';
    expect(inlineStaticCss(html, css)).toBe(html);
  });
});
