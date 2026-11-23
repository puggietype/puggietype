// electron-builder config: dev installers from the tree staged by
// `node scripts/package.mjs --dev` (out/app + out/legal). See README.md
// "Installers (dev only)".
// - No publish, no auto-update: builds stay in dist-installers/ and are
//   never uploaded anywhere.
// - No signing: no mac identity, no Windows certificate. Signing and
//   notarization are later steps that need Jake (certs are never committed).
// - out/legal (GPL-3.0 bundle) ships next to app.asar in resources/legal/
//   in every installer; app.asar also serves it as app://puggietype/legal/.
const { devDependencies } = require("./package.json");

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "com.puggietype.desktop",
  productName: "PuggieType",
  copyright: "Copyright (C) the PuggieType team. GPL-3.0-only.",
  electronVersion: devDependencies.electron,
  directories: { app: "out/app", output: "dist-installers" },
  // only the staged app: package.json, the shell and the steam web build
  files: ["package.json", "src/**/*", "web/**/*"],
  extraResources: [{ from: "out/legal", to: "legal", filter: ["**/*"] }],
  asar: true,
  npmRebuild: false,
  nodeGypRebuild: false,
  publish: null,
  detectUpdateChannel: false,
  generateUpdatesFilesForAllChannels: false,
  forceCodeSigning: false,
  artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
  linux: {
    target: [
      { target: "dir", arch: ["x64"] },
      { target: "AppImage", arch: ["x64"] },
    ],
    executableName: "puggietype",
    category: "Game",
    synopsis: "Multiplayer typing races",
  },
  win: {
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "dir", arch: ["x64"] },
    ],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
  mac: {
    target: [
      { target: "dmg", arch: ["x64", "arm64"] },
      { target: "dir", arch: ["x64", "arm64"] },
    ],
    category: "public.app-category.games",
    identity: null,
    notarize: false,
  },
};
