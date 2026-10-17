import {
  defineConfig,
  loadEnv,
  UserConfig,
  BuildEnvironmentOptions,
  PluginOption,
  CSSOptions,
} from "vite";
import path from "node:path";
import injectHTML from "vite-plugin-html-inject";
import childProcess from "child_process";
import autoprefixer from "autoprefixer";
import { Fonts } from "./src/ts/constants/fonts";
import { fontawesomeSubset } from "./vite-plugins/fontawesome-subset";
import { fontPreview } from "./vite-plugins/font-preview";
import { envConfig } from "./vite-plugins/env-config";
import { languageHashes } from "./vite-plugins/language-hashes";
import { minifyJson } from "./vite-plugins/minify-json";
import { versionFile } from "./vite-plugins/version-file";
import { oxlintChecker } from "./vite-plugins/oxlint-checker";
import { injectPreload } from "./vite-plugins/inject-preload";
import { legalMarkdown } from "./vite-plugins/legal-markdown";
import {
  getCommitHash,
  getSourceLinks,
  parseSourceUrlMode,
  sourceTarball,
} from "./vite-plugins/source-links";
import Inspect from "vite-plugin-inspect";
import { ViteMinifyPlugin } from "vite-plugin-minify";
import { VitePWA } from "vite-plugin-pwa";
import { KnownFontName } from "@monkeytype/schemas/fonts";
import solidPlugin from "vite-plugin-solid";
import devtools from "solid-devtools/vite";
import tailwindcss from "@tailwindcss/vite";

function getFontsConfig(): string {
  return `\n${Object.keys(Fonts)
    .sort()
    .map((name: string) => {
      const config = Fonts[name as KnownFontName];
      if (config.systemFont === true) return "";
      return `"${name.replaceAll("_", " ")}": (
        "src": "${config.fileName}",
        "weight": ${config.weight ?? 400},
        ),`;
    })
    .join("\n")}\n`;
}

function pad(
  numbers: number[],
  maxLength: number,
  fillString: string,
): string[] {
  return numbers.map((number) =>
    number.toString().padStart(maxLength, fillString),
  );
}

function getClientVersion(isDevelopment: boolean): string {
  if (isDevelopment) {
    return "DEVELOPMENT_CLIENT";
  }
  const date = new Date();
  const versionPrefix = pad(
    [date.getFullYear(), date.getMonth() + 1, date.getDate()],
    2,
    "0",
  ).join(".");
  const versionSuffix = pad([date.getHours(), date.getMinutes()], 2, "0").join(
    ".",
  );
  const version = [versionPrefix, versionSuffix].join("_");

  try {
    const commitHash = childProcess
      .execSync("git rev-parse --short HEAD")
      .toString();

    return `${version}_${commitHash}`.replace(/\n/g, "");
  } catch (e) {
    return `${version}_unknown-hash`;
  }
}

/** Enable for font awesome v6 */
/*
function sassList(values) {
  return values.map((it) => `"${it}"`).join(",");
}
*/

function getPlugins({
  isDevelopment,
  env,
}: {
  isDevelopment: boolean;
  env: Record<string, string>;
}): PluginOption[] {
  const clientVersion = getClientVersion(isDevelopment);
  const sourceLinks = getSourceLinks({
    commitHash: getCommitHash(),
    mode: parseSourceUrlMode(env["SOURCE_URL_MODE"]),
  });

  const plugins: PluginOption[] = [
    envConfig({ isDevelopment, clientVersion, env, sourceLinks }),
    sourceTarball(sourceLinks),
    languageHashes({ skip: isDevelopment }),
    injectHTML() as PluginOption,
    legalMarkdown({ dir: path.resolve(__dirname, "src/legal") }),
    tailwindcss(),

    solidPlugin(),
    devtools({
      autoname: true,
    }),
  ];

  // The type-aware oxlint checker spawns tsgolint processes of ~2 GB each;
  // several dev servers at once exhausted the box's memory. Opt in with
  // OXLINT_CHECKER=1 (lint-staged still lints on commit).
  const devPlugins: PluginOption[] = [
    ...(process.env["OXLINT_CHECKER"] === "1"
      ? [
          oxlintChecker({
            debounceDelay: 125,
            typeAware: true,
            overlay: isDevelopment,
          }),
        ]
      : []),
    Inspect(),
  ];

  const prodPlugins: PluginOption[] = [
    fontPreview(),
    fontawesomeSubset(),
    versionFile({ clientVersion }),
    ViteMinifyPlugin(),
    VitePWA({
      // injectRegister: "networkfirst",
      injectRegister: null,
      registerType: "autoUpdate",
      manifest: {
        short_name: "puggietype",
        name: "puggietype",
        description: "a minimalist typing test with a little pug",
        start_url: "/",
        icons: [
          {
            src: "/images/favicon/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/images/favicon/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/images/favicon/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
        ],
        background_color: "#161514",
        display: "standalone",
        theme_color: "#161514",
      },
      manifestFilename: "manifest.json",
      workbox: {
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globIgnores: ["**/.*"],
        globPatterns: [],
        navigateFallback: "",
        runtimeCaching: [
          {
            urlPattern: (options) => {
              return (
                options.sameOrigin && !options.url.pathname.startsWith("/ws")
              );
            },
            handler: "NetworkFirst",
            options: {},
          },
          {
            urlPattern: (options) => {
              //disable caching for version.json
              return options.url.pathname === "/version.json";
            },
            handler: "NetworkOnly",
            options: {},
          },
        ],
      },
    }),
    injectPreload(),
    minifyJson(),
  ];

  return [...plugins, ...(isDevelopment ? devPlugins : prodPlugins)].filter(
    (it) => it !== null,
  );
}

function getBuildOptions({
  enableSourceMaps,
}: {
  enableSourceMaps: boolean;
}): BuildEnvironmentOptions {
  return {
    sourcemap: enableSourceMaps,
    emptyOutDir: true,
    outDir: "../dist",
    assetsInlineLimit: 0, //dont inline small files as data
    rolldownOptions: {
      input: {
        puggietype: path.resolve(__dirname, "src/index.html"),
        email: path.resolve(__dirname, "src/email-handler.html"),
        privacy: path.resolve(__dirname, "src/privacy.html"),
        terms: path.resolve(__dirname, "src/terms.html"),
        404: path.resolve(__dirname, "src/404.html"),
      },
      output: {
        assetFileNames: (assetInfo) => {
          let extType = (assetInfo.names[0] as string).split(".").at(1);

          if (extType === undefined) {
            throw new Error(
              `Could not determine asset type for asset: ${assetInfo.names[0]}`,
            );
          }

          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
            extType = "images";
          }
          if (
            /\.(woff|woff2|eot|ttf|otf)$/.test(assetInfo.names[0] as string)
          ) {
            return `webfonts/[name]-[hash].${extType}`;
          }
          // oxlint-disable-next-line no-deprecated
          if (assetInfo.name === "misc.css") {
            return `${extType}/vendor.[hash][extname]`;
          }

          return `${extType}/[name].[hash][extname]`;
        },
        chunkFileNames: "js/[name].[hash].js",
        entryFileNames: "js/[name].[hash].js",
        codeSplitting: {
          groups: [
            {
              name: "vendor-firebase",
              test: /node_modules\/@firebase\//,
            },
            {
              name: "vendor-tanstack",
              test: /node_modules\/@tanstack\//,
            },
            {
              name: "puggietype-packages",
              test: /monkeytype\/packages\//,
            },
            {
              name: "vendor-chart",
              test: /node_modules\/chart/,
            },
            {
              name: "puggietype-utils",
              test: /src\/ts\/utils\//,
            },
            {
              name: "vendor",
              test: /node_modules\//,
            },
          ],
        },
      },
    },
  };
}

function getCssOptions({
  isDevelopment,
}: {
  isDevelopment: boolean;
}): CSSOptions {
  return {
    devSourcemap: true,
    postcss: {
      plugins: [autoprefixer({})],
    },
    preprocessorOptions: {
      scss: {
        additionalData(source: string, fp: string) {
          if (isDevelopment || fp.endsWith("index.scss")) {
            /** Enable for font awesome v6 */
            /*
                const fontawesomeClasses = getFontawesomeConfig();

                //inject variables into sass context
                $fontawesomeBrands: ${sassList(
                  fontawesomeClasses.brands
                )};             
                $fontawesomeSolid: ${sassList(fontawesomeClasses.solid)};
              */

            const bypassFonts = isDevelopment
              ? `
                $fontAwesomeOverride:"@fortawesome/fontawesome-free/webfonts";
                $previewFontsPath:"webfonts";`
              : "";
            const fonts = `
              ${bypassFonts}
              $fonts: (${getFontsConfig()});
              `;
            return `
              //inject variables into sass context
              ${fonts}
            
              ${source}`;
          } else {
            return source;
          }
        },
      },
    },
  };
}

export default defineConfig(({ mode }): UserConfig => {
  const env = loadEnv(mode, process.cwd(), "");
  const isDevelopment = mode !== "production";

  if (!isDevelopment) {
    if (
      env["BACKEND_URL"] !== undefined &&
      env["RECAPTCHA_SITE_KEY"] === undefined
    ) {
      throw new Error(`${mode}: RECAPTCHA_SITE_KEY is not defined`);
    }
  }

  // no BACKEND_URL => no auth/api: swap the Firebase SDK for a stub and let
  // the minifier drop backend-only code (reCAPTCHA loader) behind __STANDALONE__
  const standalone = (env["BACKEND_URL"] ?? "") === "";
  const firebaseStub = path.resolve(
    __dirname,
    "src/ts/standalone/firebase-stub.ts",
  );

  return {
    plugins: getPlugins({ isDevelopment, env }),
    define: { __STANDALONE__: JSON.stringify(standalone) },
    resolve: {
      alias: standalone
        ? [
            { find: /^firebase\/(app|auth)$/, replacement: firebaseStub },
            { find: /^.*\/load-firebase-config$/, replacement: firebaseStub },
          ]
        : [],
    },
    build: getBuildOptions({ enableSourceMaps: false }),
    css: getCssOptions({ isDevelopment }),
    server: {
      open: env["SERVER_OPEN"] !== "false",
      port: 3000,
      strictPort: true,
      host: "0.0.0.0",
      // cloudflare quick tunnels use random *.trycloudflare.com hosts
      allowedHosts: true,
      // hmr: no port set, so the client reuses the page's host/port/protocol
      // (works through https tunnels on 443)
      proxy: {
        // MP_WS_TARGET points a second dev server at a test WS server
        "/ws": {
          target: process.env["MP_WS_TARGET"] ?? "ws://localhost:2567",
          ws: true,
        },
      },
      watch: {
        //we rebuild the whole contracts package when a file changes
        //so we only want to watch one file
        ignored: [/.*\/packages\/contracts\/dist\/(?!configs).*/],
      },
    },
    clearScreen: false,
    root: "src",
    publicDir: "../static",
    optimizeDeps: {
      exclude: ["@fortawesome/fontawesome-free"],
    },
  };
});
