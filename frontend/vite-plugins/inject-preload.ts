import { IndexHtmlTransformContext, Plugin } from "vite";
// eslint-disable-next-line import/no-unresolved
import UnpluginInjectPreload from "unplugin-inject-preload/vite";
import { basename } from "node:path";
export function injectPreload(): Plugin {
  const base = UnpluginInjectPreload({
    // no font preloads: on slow mobile links five fonts (~260 KB, mostly icon
    // fonts) competed with the boot JS; the css discovers the ones a page uses
    files: [
      {
        outputMatch: /css\/.*\.css$/,
        attributes: {
          as: "style",
          type: "text/css",
          rel: "preload",
          crossorigin: true,
        },
      },
    ],
    injectTo: "head-prepend",
  }) as {
    name: string;
    vite: {
      transformIndexHtml: {
        handler: (html: string, ctx: IndexHtmlTransformContext) => string;
      };
    };
  };

  return {
    name: base.name,
    ...base.vite,
    transformIndexHtml(html, ctx) {
      //only add preload to the index.html file
      if (basename(ctx.filename) !== "index.html") {
        return html;
      }
      return base.vite.transformIndexHtml.handler(html, ctx);
    },
  };
}
