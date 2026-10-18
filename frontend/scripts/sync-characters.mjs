#!/usr/bin/env node
// Copy the character (dog) frames from the art pipeline into
// static/images/characters/<id>/<id>-<frame>.svg, compacted (see
// character-svg.mjs), plus a <id>-head.svg crop for 32px lists.
//   pnpm sync-characters
// ART_DIR overrides the frames folder (default: the art kit's final frames).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHARACTER_IDS,
  compactSvg,
  FRAME_NAMES,
  makeHead,
  tokenizeColors,
  unifyHalo,
} from "./character-svg.mjs";

// default: frames generated in-repo by `python3 art/render8.py`
const ART_DIR =
  process.env["ART_DIR"] ??
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../art/sketches/frames",
  );
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../static/images/characters",
);

if (!fs.existsSync(ART_DIR)) {
  console.error(`art frames not found: ${ART_DIR}`);
  process.exit(1);
}

function write(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`updated ${path.relative(process.cwd(), file)}`);
}

for (const id of CHARACTER_IDS) {
  for (const frame of FRAME_NAMES) {
    const src = path.join(ART_DIR, `${id}-${frame}.svg`);
    const svg = compactSvg(
      tokenizeColors(unifyHalo(fs.readFileSync(src, "utf8"))),
    );
    write(path.join(OUT, id, `${id}-${frame}.svg`), svg);
    if (frame === "idle")
      write(path.join(OUT, id, `${id}-head.svg`), makeHead(svg));
  }
}
