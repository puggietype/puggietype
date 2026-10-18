#!/usr/bin/env bash
# Copy the pug art from the brand kit into static/. Frames are copied by
# filename, so redrawn art drops in with no code change.
#   pnpm sync-pug            frames only
#   pnpm sync-pug --all      frames + favicons + logos + theme tokens + mono pug
# BRAND_DIR (required) = path to the brand kit checkout.
set -euo pipefail

if [ -z "${BRAND_DIR:-}" ]; then
  echo "BRAND_DIR is not set: export BRAND_DIR=/path/to/brand-kit (the dir containing mascot/svg)" >&2
  exit 1
fi
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

# drop frames the brand kit no longer ships
for f in "$STATIC"/images/pug/*.svg; do
  [ -f "$BRAND_DIR/mascot/svg/$(basename "$f")" ] && continue
  rm "$f"
  echo "removed ${f#"$FRONTEND_DIR"/}"
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
const kebab = (k) => k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
for (const [name, t] of Object.entries(themes)) {
  // every opponent + pug token the brand kit defines
  const keys = Object.keys(t).filter((k) => /^(opp\d|pug[A-Z])/.test(k));
  const lines = keys.map((k) => `  --${kebab(k)}: ${t[k].toLowerCase()};`);
  const css = `/* generated from brand/tokens.json (${name}) */\n:root {\n${lines.join("\n")}\n}\n`;
  const file = `${themesDir}/${name.replace(/-/g, "_")}.css`;
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === css) continue;
  fs.writeFileSync(file, css);
  console.log("updated " + file);
}
EOF

  # monochrome pug override, from the [data-pug="mono"] block in tokens.css
  node - "$BRAND_DIR/tokens.css" "$FRONTEND_DIR/src/styles/pug-mono.scss" <<'EOF'
const fs = require("fs");
const [tokensPath, out] = process.argv.slice(2);
const css = fs.readFileSync(tokensPath, "utf8");
const block = /\[data-pug="mono"\]\s*\{([^}]*)\}/.exec(css);
if (!block) {
  console.error('no [data-pug="mono"] block in tokens.css');
  process.exit(1);
}
const lines = block[1].split(";").map((l) => l.trim()).filter(Boolean)
  .map((l) => `  ${l.replace(/#[0-9a-f]{3,8}\b/gi, (c) => c.toLowerCase())};`);
const scss = `// generated from brand/tokens.css by scripts/sync-pug-art.sh
// monochrome line-art pug: <html data-pug="mono"> (set for non-puggie themes)
:root[data-pug="mono"] {
${lines.join("\n")}
}
`;
if (fs.existsSync(out) && fs.readFileSync(out, "utf8") === scss) process.exit(0);
fs.writeFileSync(out, scss);
console.log("updated " + out);
EOF
fi

# frames referenced in code must exist
for f in $(grep -oh 'pug-[a-z-]*\.svg' "$FRONTEND_DIR/src/ts/components/pages/test/pug-frames.ts" | sort -u); do
  [ -f "$STATIC/images/pug/$f" ] || { echo "missing frame: $f" >&2; exit 1; }
done
echo "pug art in sync"
