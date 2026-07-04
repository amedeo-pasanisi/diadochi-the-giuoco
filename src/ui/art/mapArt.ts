import {
  CAMPS,
  MAP_SIZE_M,
  type BattlefieldDef,
  type HillFeature,
  type RiverFeature,
  type SeaFeature,
  type WoodsFeature,
} from "../../engine/battlefield";
import { argeadStarPoints } from "./ornaments";

/**
 * Battlefield map renderer (§2.2): papyrus ground, concentric altitude
 * rings for hills, stylized woods, light-blue rivers and sea, Argead
 * stars for the camps. Pure function of terrain data — the deployment
 * and battle screens will reuse it as their base layer.
 */

const PAPYRUS_1 = "#dcc189";
const PAPYRUS_2 = "#c9a96b";
const HILL_LINE = "#8a5a2e";
const HILL_SHADE = "#b08949";
const WATER = "#7fb2c4";
const WATER_DEEP = "#6aa0b4";
const OLIVE = "#6f6636";
const TRUNK = "#7a4a26";
const INK = "#6e3417";

function seaSVG(f: SeaFeature): string {
  // gently wavy shoreline
  const pts: string[] = [`M 0 0 L ${f.width} 0`];
  for (let y = 0; y <= MAP_SIZE_M; y += 400) {
    const x = f.width + Math.sin(y / 620 + 1.3) * 110 + Math.sin(y / 210) * 45;
    pts.push(`L ${x.toFixed(0)} ${y}`);
  }
  pts.push(`L 0 ${MAP_SIZE_M} Z`);
  let s = `<path d="${pts.join(" ")}" fill="${WATER}"/>`;
  // wave strokes
  for (let i = 0; i < 7; i++) {
    const wx = 120 + (i % 3) * 240;
    const wy = 420 + i * 800;
    s += `<path d="M ${wx} ${wy} q 90 -55 180 0 q 90 55 180 0" fill="none" stroke="${WATER_DEEP}" stroke-width="26" stroke-linecap="round"/>`;
  }
  return s;
}

function riverSVG(f: RiverFeature): string {
  // smooth path through the points via midpoint quadratics
  const p = f.points;
  let d = `M ${p[0]![0]} ${p[0]![1]}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [x1, y1] = p[i]!;
    const [x2, y2] = p[i + 1]!;
    d += ` Q ${x1} ${y1} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`;
  }
  const [lx, ly] = p[p.length - 1]!;
  d += ` L ${lx} ${ly}`;
  const w = Math.max(f.width, 80); // exaggerate thin rivers so they stay visible
  return (
    `<path d="${d}" fill="none" stroke="${WATER}" stroke-width="${w}" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${WATER_DEEP}" stroke-width="${w * 0.3}" stroke-linecap="round" opacity="0.6"/>`
  );
}

function hillSVG(f: HillFeature): string {
  let s = "";
  for (let i = 0; i < f.levels; i++) {
    const sc = 1 - i / (f.levels + 0.4);
    s += `<ellipse cx="${f.cx}" cy="${f.cy}" rx="${(f.rx * sc).toFixed(0)}" ry="${(f.ry * sc).toFixed(0)}"
      fill="${HILL_SHADE}" fill-opacity="0.14"
      stroke="${HILL_LINE}" stroke-width="14" stroke-opacity="0.85"/>`;
  }
  return s;
}

function woodsSVG(f: WoodsFeature): string {
  let s = `<ellipse cx="${f.cx}" cy="${f.cy}" rx="${f.rx}" ry="${f.ry}"
    fill="${OLIVE}" fill-opacity="0.16" stroke="${OLIVE}" stroke-opacity="0.55"
    stroke-width="12" stroke-dasharray="40 55"/>`;
  // deterministic tree scatter on a golden-angle spiral
  const n = Math.max(5, Math.round((f.rx * f.ry) / 32000));
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt((i + 0.5) / n) * 0.82;
    const th = i * 2.39996;
    const x = f.cx + Math.cos(th) * r * f.rx;
    const y = f.cy + Math.sin(th) * r * f.ry;
    s += `<line x1="${x.toFixed(0)}" y1="${(y + 70).toFixed(0)}" x2="${x.toFixed(0)}" y2="${y.toFixed(0)}" stroke="${TRUNK}" stroke-width="22"/>`;
    s += `<circle cx="${x.toFixed(0)}" cy="${(y - 40).toFixed(0)}" r="62" fill="${OLIVE}"/>`;
  }
  return s;
}

export interface MapRenderOpts {
  /** Draw the camp stars (default true). */
  camps?: boolean;
  /** Draw the 1 km scale bar (default true). */
  scaleBar?: boolean;
}

/** Full map as an SVG string, viewBox 0..6000. Scale with CSS width. */
export function renderMapSVG(def: BattlefieldDef, opts: MapRenderOpts = {}): string {
  const layers: string[] = [];

  // papyrus ground with faint fiber lines
  layers.push(`<defs>
    <linearGradient id="pap-${def.id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PAPYRUS_1}"/>
      <stop offset="1" stop-color="${PAPYRUS_2}"/>
    </linearGradient>
  </defs>
  <rect width="${MAP_SIZE_M}" height="${MAP_SIZE_M}" fill="url(#pap-${def.id})"/>`);
  for (let i = 1; i < 12; i++) {
    layers.push(
      `<line x1="0" y1="${i * 500}" x2="${MAP_SIZE_M}" y2="${i * 500}" stroke="#8a6c3c" stroke-opacity="0.08" stroke-width="10"/>`,
    );
  }

  // terrain: sea, then hills, woods, rivers
  for (const f of def.features) if (f.kind === "sea") layers.push(seaSVG(f));
  for (const f of def.features) if (f.kind === "hill") layers.push(hillSVG(f));
  for (const f of def.features) if (f.kind === "woods") layers.push(woodsSVG(f));
  for (const f of def.features) if (f.kind === "river") layers.push(riverSVG(f));

  // camps (§2.2): Argead stars north and south
  if (opts.camps !== false) {
    for (const camp of [CAMPS.north, CAMPS.south]) {
      layers.push(`<polygon points="${argeadStarPoints(camp.x, camp.y, 240)}" fill="#8a3d1e" fill-opacity="0.92"/>`);
      layers.push(`<circle cx="${camp.x}" cy="${camp.y}" r="34" fill="#8a3d1e"/>`);
    }
  }

  // scale bar: 1 km
  if (opts.scaleBar !== false) {
    layers.push(`<g stroke="${INK}" stroke-width="18">
      <line x1="260" y1="5760" x2="1260" y2="5760"/>
      <line x1="260" y1="5700" x2="260" y2="5820"/>
      <line x1="1260" y1="5700" x2="1260" y2="5820"/>
    </g>
    <text x="360" y="5660" font-family="Georgia, serif" font-size="170" fill="${INK}">1 km</text>`);
  }

  // frame
  layers.push(`<rect x="15" y="15" width="${MAP_SIZE_M - 30}" height="${MAP_SIZE_M - 30}"
    fill="none" stroke="${INK}" stroke-width="30"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_SIZE_M} ${MAP_SIZE_M}">${layers.join("")}</svg>`;
}
