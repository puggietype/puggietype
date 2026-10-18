// Character frame clean-up shared by scripts/sync-characters.mjs and
// scripts/check-characters.mjs. Pure string transforms, no deps.

export const CHARACTER_IDS = [
  "puggie",
  "chowie",
  "frenchie",
  "tuckie",
  "huskie",
  "corgie",
  "shibie",
  "goldie",
];

export const FRAME_NAMES = [
  "idle",
  "blink",
  "left-paw-down",
  "right-paw-down",
  "both-down",
  "left-paw-half",
  "right-paw-half",
  "winner",
  "winner-small",
];

/** crop of the idle frame used as the 32px list head (head + paw tips) */
export const HEAD_VIEWBOX = "80 4 352 296";

/** [start, end) of the `<g class="halo">…</g>` group, or undefined */
function findHalo(svg) {
  const start = svg.indexOf('<g class="halo">');
  if (start === -1) return undefined;
  const tag = /<(\/?)g\b[^>]*?(\/?)>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let m = tag.exec(svg); m !== null; m = tag.exec(svg)) {
    if (m[2] === "/") continue;
    depth += m[1] === "/" ? -1 : 1;
    if (depth === 0) return [start, m.index + m[0].length];
  }
  return undefined;
}

/**
 * Every dog gets puggie's sticker halo (--pug-fill) so the visible rim is the
 * same cream/white border + dark --pug-ink line in every theme, instead of a
 * coat-coloured rim.
 */
export function unifyHalo(svg) {
  const range = findHalo(svg);
  if (range === undefined) return svg;
  const [a, b] = range;
  const halo = svg
    .slice(a, b)
    .replace(
      /var\(--(?!pug-)[a-z0-9-]+, (#[0-9A-Fa-f]{3,8})\)/g,
      "var(--pug-fill, #FFFFFF)",
    );
  return svg.slice(0, a) + halo + svg.slice(b);
}

/** hard-coded art colours that get a theme token (mono maps them to ink) */
const LOOSE_COLORS = { "#7A2E2E": "--dog-mouth" };

export function tokenizeColors(svg) {
  return svg.replace(
    /(fill|stroke)="(#[0-9A-Fa-f]{6})"/g,
    (whole, attr, hex) => {
      const token = LOOSE_COLORS[hex.toUpperCase()];
      return token === undefined ? whole : `${attr}="var(${token}, ${hex})"`;
    },
  );
}

/**
 * Shrink the markup without visibly changing the drawing: whole-unit path data,
 * compact path data, root-level round line caps, and repeated
 * `var(--token, #fallback)` colours aliased to a short custom property set on
 * the root (the fallback still lives there).
 */
export function compactSvg(markup) {
  let svg = markup.trim();
  // whole-unit path data: the drawing sits at scale(.92) on a 512 canvas and
  // ships at <=200px, so this is invisible (<=.2px) and keeps frames <=40KB
  svg = svg.replace(/\sd="([^"]*)"/g, (_m, d) => {
    const out = d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n))));
    return ` d="${out}"`;
  });
  svg = svg.replace(/(\d)\.0(?!\d)/g, "$1");
  svg = svg.replace(/(^|[^\d.\w#-])(-?)0\.(\d)/g, "$1$2.$3");
  svg = svg.replace(/\sd="([^"]*)"/g, (_m, d) => {
    const out = d
      .trim()
      .replace(/\s*([MLHVCSQTAZmlhvcsqtaz])\s*/g, "$1")
      .replace(/[\s,]+-/g, "-")
      .replace(/\s+/g, " ");
    return ` d="${out}"`;
  });
  svg = svg.replace(/\s+\/>/g, "/>").replace(/>\s+</g, "><");
  // hoist round caps/joins to the root only where that comes out smaller
  svg = [{}, { "stroke-linecap": "round" }, ROOT_DEFAULTS]
    .map((defaults) => dropInheritedAttrs(svg, defaults))
    .reduce((a, b) => (b.length < a.length ? b : a));

  const counts = new Map();
  for (const [v] of svg.matchAll(/var\(--[a-z0-9-]+, #[0-9A-Fa-f]{3,8}\)/g)) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const aliases = [...counts]
    .filter(([v, n]) => n * (v.length - 9) > v.length + 6)
    .map(([v], i) => [v, `--c${i}`]);
  for (const [v, name] of aliases) {
    svg = svg.split(v).join(`var(${name})`);
  }
  const style = aliases.map(([v, name]) => `${name}:${v}`).join(";");
  if (style) svg = svg.replace(/^<svg\b/, `<svg style="${style}"`);
  return svg + "\n";
}

const INHERITED = {
  fill: "black",
  stroke: "none",
  "stroke-width": "1",
  "stroke-linejoin": "miter",
  "stroke-linecap": "butt",
  "fill-opacity": "1",
  "stroke-opacity": "1",
};
// the art strokes nearly everything with round caps/joins: make that the root
// default so the per-element attributes can go
const ROOT_DEFAULTS = { "stroke-linejoin": "round", "stroke-linecap": "round" };
const STROKE_ONLY = new Set([
  "stroke-width",
  "stroke-linejoin",
  "stroke-linecap",
  "stroke-opacity",
]);
const SHAPES = new Set([
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
]);

/**
 * Remove inheritable presentation attributes that equal what the element
 * already inherits (after moving round caps/joins to the root), adding an
 * explicit value only where the new root default would change the result.
 * Walks the document in source order, which is how svg inheritance works for
 * this art (no <use>; mask/clip content inherits from its own ancestors).
 */
export function dropInheritedAttrs(svg, rootDefaults = ROOT_DEFAULTS) {
  const stack = [];
  const tag = /<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z:-]+="[^"]*")*)\s*(\/?)>/g;
  return svg.replace(tag, (whole, close, name, rawAttrs, selfClose) => {
    if (close) {
      stack.pop();
      return whole;
    }
    const attrs = [...rawAttrs.matchAll(/\s+([a-zA-Z:-]+)="([^"]*)"/g)].map(
      ([, k, v]) => [k, v],
    );
    const own = Object.fromEntries(attrs);
    const parent = stack.at(-1) ?? {
      orig: INHERITED,
      next: { ...INHERITED, ...rootDefaults },
    };
    const orig = { ...parent.orig };
    const next = { ...parent.next };
    const isRoot = stack.length === 0;
    const keep = attrs.filter(([k]) => !(k in INHERITED));
    const unstroked =
      SHAPES.has(name) && (own["stroke"] ?? parent.orig["stroke"]) === "none";
    for (const k of Object.keys(INHERITED)) {
      const v = own[k];
      orig[k] = v ?? parent.orig[k];
      const pinned = v !== undefined && /currentColor|url\(/.test(v);
      if (isRoot) {
        next[k] = v ?? next[k];
        if (next[k] !== INHERITED[k]) keep.push([k, next[k]]);
        continue;
      }
      if (!pinned && orig[k] === parent.next[k]) continue;
      if (v === undefined && STROKE_ONLY.has(k) && unstroked) continue;
      keep.push([k, orig[k]]);
      next[k] = orig[k];
    }
    if (!selfClose) stack.push({ orig, next });
    const out = keep.map(([k, v]) => ` ${k}="${v}"`).join("");
    return `<${name}${out}${selfClose ? "/" : ""}>`;
  });
}

/** 32px list head: the idle frame cropped to the head */
export function makeHead(idleSvg) {
  return idleSvg
    .replace(/\sviewBox="[^"]*"/, ` viewBox="${HEAD_VIEWBOX}"`)
    .replace(/\swidth="512" height="512"/, ' width="32" height="26.9"');
}
