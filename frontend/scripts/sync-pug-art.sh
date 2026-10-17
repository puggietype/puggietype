#!/usr/bin/env bash
# Copy the pug art from the brand kit into static/. Frames are copied by
# filename, so redrawn art drops in with no code change.
#   pnpm sync-pug            frames only
#   pnpm sync-pug --all      frames + favicons + logos + theme tokens
# BRAND_DIR overrides the brand kit location.
set -euo pipefail

BRAND_DIR="${BRAND_DIR:-/workspace/puggietype/brand}"
FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATIC="$FRONTEND_DIR/static"

if [ ! -d "$BRAND_DIR/mascot/svg" ]; then
  echo "brand kit not found: $BRAND_DIR/mascot/svg" >&2
  exit 1
fi

copy() {
  local src="$1" dest="$2"
  if cmp -s "$src" "$dest" 2>/dev/null; then return; fi
  cp "$src" "$dest"
  echo "updated ${dest#"$FRONTEND_DIR"/}"
}

mkdir -p "$STATIC/images/pug"
for f in "$BRAND_DIR"/mascot/svg/*.svg; do
  copy "$f" "$STATIC/images/pug/$(basename "$f")"
done

if [ "${1:-}" = "--all" ]; then
  for f in "$BRAND_DIR"/favicon/*; do
    copy "$f" "$STATIC/images/favicon/$(basename "$f")"
  done
  for f in "$BRAND_DIR"/logo/*.svg; do
    copy "$f" "$STATIC/images/logo/$(basename "$f")"
  done

  # opponent + pug colour tokens for the puggie themes
  node - "$BRAND_DIR/tokens.json" "$STATIC/themes" <<'EOF'
const fs = require("fs");
const [tokensPath, themesDir] = process.argv.slice(2);
const { themes } = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
const keys = ["opp1", "opp2", "opp3", "opp4", "pugInk", "pugFill", "pugPaw",
  "pugMask", "pugBean", "pugKey", "pugBlush"];
const kebab = (k) => k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
for (const [name, t] of Object.entries(themes)) {
  const lines = keys.filter((k) => t[k]).map((k) => `  --${kebab(k)}: ${t[k].toLowerCase()};`);
  const css = `/* generated from brand/tokens.json (${name}) */\n:root {\n${lines.join("\n")}\n}\n`;
  const file = `${themesDir}/${name.replace(/-/g, "_")}.css`;
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === css) continue;
  fs.writeFileSync(file, css);
  console.log("updated " + file);
}
EOF
fi

# frames referenced in code must exist
for f in $(grep -oh 'pug-[a-z-]*\.svg' "$FRONTEND_DIR/src/ts/components/pages/test/pug-frames.ts" | sort -u); do
  [ -f "$STATIC/images/pug/$f" ] || { echo "missing frame: $f" >&2; exit 1; }
done
echo "pug art in sync"
