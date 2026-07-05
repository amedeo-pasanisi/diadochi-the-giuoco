import {
  CAMPS,
  MAP_SIZE_M,
  type BattlefieldDef,
  type SeaFeature,
} from "../../engine/battlefield";
import {
  fbm,
  geometryOf,
  hash01,
  pointInPolygon,
  type BattlefieldGeometry,
  type RiverGeometry,
  type WoodsGeometry,
} from "../../engine/terrainGen";
import { argeadStarPoints } from "./ornaments";

/**
 * Battlefield map renderer (§2.2): papyrus ground, TOPOGRAPHIC contour
 * lines traced from the actual heightfield (marching squares), canvas
 * hillshading, organic woods, meandering rivers. Everything derives
 * from the same engine geometry the battle sim uses.
 */

const PAPYRUS_1 = "#dcc189";
const PAPYRUS_2 = "#c9a96b";
const HILL_LINE = "#8a5a2e";
const WATER = "#7fb2c4";
const WATER_DEEP = "#6aa0b4";
const OLIVE = "#6f6636";
const INK = "#6e3417";

/* ---------- marching squares: iso-contours of the heightfield ---------- */

type Pt = [number, number];

function contoursAt(
  sample: (x: number, y: number) => number,
  iso: number,
  cells: number,
): Pt[][] {
  const step = MAP_SIZE_M / cells;
  const grid: number[][] = [];
  for (let j = 0; j <= cells; j++) {
    const row: number[] = [];
    for (let i = 0; i <= cells; i++) row.push(sample(i * step, j * step));
    grid.push(row);
  }

  const segs: [Pt, Pt][] = [];
  const lerp = (a: number, b: number): number => (iso - a) / (b - a || 1e-9);

  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const v00 = grid[j]![i]!;
      const v10 = grid[j]![i + 1]!;
      const v01 = grid[j + 1]![i]!;
      const v11 = grid[j + 1]![i + 1]!;
      const idx = (v00 > iso ? 1 : 0) | (v10 > iso ? 2 : 0) | (v11 > iso ? 4 : 0) | (v01 > iso ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const x = i * step;
      const y = j * step;
      const T: Pt = [x + lerp(v00, v10) * step, y];
      const B: Pt = [x + lerp(v01, v11) * step, y + step];
      const L: Pt = [x, y + lerp(v00, v01) * step];
      const R: Pt = [x + step, y + lerp(v10, v11) * step];
      const add = (a: Pt, b: Pt): void => {
        segs.push([a, b]);
      };
      switch (idx) {
        case 1: add(L, T); break;
        case 2: add(T, R); break;
        case 3: add(L, R); break;
        case 4: add(R, B); break;
        case 5: add(L, T); add(R, B); break;
        case 6: add(T, B); break;
        case 7: add(L, B); break;
        case 8: add(L, B); break;
        case 9: add(T, B); break;
        case 10: add(T, R); add(L, B); break;
        case 11: add(R, B); break;
        case 12: add(L, R); break;
        case 13: add(T, R); break;
        case 14: add(L, T); break;
      }
    }
  }

  // chain segments into continuous polylines
  const key = (p: Pt): string => `${Math.round(p[0])},${Math.round(p[1])}`;
  const adj = new Map<string, [Pt, Pt][]>();
  for (const s of segs) {
    for (const p of s) {
      const k = key(p);
      const list = adj.get(k) ?? [];
      list.push(s);
      adj.set(k, list);
    }
  }
  const used = new Set<[Pt, Pt]>();
  const lines: Pt[][] = [];
  for (const seg of segs) {
    if (used.has(seg)) continue;
    used.add(seg);
    const line: Pt[] = [seg[0], seg[1]];
    // extend forward then backward
    for (const dir of [1, 0] as const) {
      for (;;) {
        const end = dir === 1 ? line[line.length - 1]! : line[0]!;
        const next = (adj.get(key(end)) ?? []).find((s) => !used.has(s));
        if (!next) break;
        used.add(next);
        const other = key(next[0]) === key(end) ? next[1] : next[0];
        if (dir === 1) line.push(other);
        else line.unshift(other);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** One Chaikin smoothing pass (keeps endpoints). */
function chaikin(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]!];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

function polyPath(pts: Pt[], close = false): string {
  let d = `M ${pts[0]![0].toFixed(0)} ${pts[0]![1].toFixed(0)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i]![0].toFixed(0)} ${pts[i]![1].toFixed(0)}`;
  return close ? d + " Z" : d;
}

/** Closed smooth path through polygon vertices via midpoint quadratics. */
function blobPath(poly: Pt[]): string {
  const n = poly.length;
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M ${mid(poly[n - 1]!, poly[0]!).map((v) => v.toFixed(0)).join(" ")}`;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const m = mid(p, poly[(i + 1) % n]!);
    d += ` Q ${p[0].toFixed(0)} ${p[1].toFixed(0)} ${m[0].toFixed(0)} ${m[1].toFixed(0)}`;
  }
  return d + " Z";
}

/* ---------- hillshading via offscreen canvas ---------- */

function hillshadeHref(geom: BattlefieldGeometry): string {
  const N = 160;
  const canvas = document.createElement("canvas");
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(N, N);
  const step = MAP_SIZE_M / N;
  const h = (i: number, j: number): number => geom.heightAt(i * step, j * step);
  const maxL = Math.max(1, geom.maxLevel);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const v = h(i, j);
      const env = Math.min(1, v * 1.4);
      // light from the north-west: darker on south-east slopes
      const grad = h(i - 1, j - 1) - h(i + 1, j + 1);
      const bright = Math.max(0, Math.min(1, 0.5 + grad * 0.55));
      const alpha = env * (0.1 + 0.16 * (v / maxL) + 0.3 * (1 - bright));
      const o = (j * N + i) * 4;
      img.data[o] = 110;
      img.data[o + 1] = 72;
      img.data[o + 2] = 36;
      img.data[o + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

/* ---------- feature layers ---------- */

function seaSVG(f: SeaFeature, seed: number): string {
  const pts: string[] = [`M 0 0 L ${f.width} 0`];
  for (let y = 0; y <= MAP_SIZE_M; y += 250) {
    const x = f.width + (fbm(seed + 5, 3.3, y * 0.00095, 3) - 0.5) * 400;
    pts.push(`L ${x.toFixed(0)} ${y}`);
  }
  pts.push(`L 0 ${MAP_SIZE_M} Z`);
  let s = `<path d="${pts.join(" ")}" fill="${WATER}"/>`;
  for (let i = 0; i < 8; i++) {
    const wx = 90 + hash01(seed, i, 3) * 380;
    const wy = 300 + i * 700 + hash01(seed, i, 7) * 220;
    s += `<path d="M ${wx.toFixed(0)} ${wy.toFixed(0)} q 80 -50 160 0 q 80 50 160 0" fill="none" stroke="${WATER_DEEP}" stroke-width="24" stroke-linecap="round"/>`;
  }
  return s;
}

function riverSVG(r: RiverGeometry): string {
  const pts = chaikin(r.points as Pt[]);
  const d = polyPath(pts);
  const w = Math.max(r.width, 80);
  return (
    `<path d="${d}" fill="none" stroke="${WATER}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${WATER_DEEP}" stroke-width="${w * 0.3}" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>`
  );
}

function woodsSVG(w: WoodsGeometry, seed: number): string {
  let s = `<path d="${blobPath(w.poly as Pt[])}" fill="${OLIVE}" fill-opacity="0.17"
    stroke="${OLIVE}" stroke-opacity="0.5" stroke-width="10"/>`;
  const n = Math.max(6, Math.round((w.rx * w.ry) / 26000));
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt((i + 0.5) / n) * 0.95;
    const th = i * 2.39996;
    const x = w.cx + Math.cos(th) * r * w.rx + (hash01(seed, i, 11) - 0.5) * 160;
    const y = w.cy + Math.sin(th) * r * w.ry + (hash01(seed, i, 17) - 0.5) * 160;
    if (!pointInPolygon(x, y, w.poly)) continue;
    const sc = 0.8 + hash01(seed, i, 23) * 0.5;
    s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(60 * sc).toFixed(0)}" fill="${OLIVE}"/>`;
  }
  return s;
}

/* ---------- assembly ---------- */

export interface MapRenderOpts {
  camps?: boolean;
  scaleBar?: boolean;
}

export function renderMapSVG(def: BattlefieldDef, opts: MapRenderOpts = {}): string {
  const geom = geometryOf(def);
  const layers: string[] = [];

  layers.push(`<defs>
    <linearGradient id="pap-${def.id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PAPYRUS_1}"/>
      <stop offset="1" stop-color="${PAPYRUS_2}"/>
    </linearGradient>
  </defs>
  <rect width="${MAP_SIZE_M}" height="${MAP_SIZE_M}" fill="url(#pap-${def.id})"/>`);
  for (let i = 1; i < 12; i++) {
    layers.push(
      `<line x1="0" y1="${i * 500}" x2="${MAP_SIZE_M}" y2="${i * 500}" stroke="#8a6c3c" stroke-opacity="0.07" stroke-width="10"/>`,
    );
  }

  // relief shading beneath the contours
  if (geom.maxLevel > 0) {
    layers.push(
      `<image href="${hillshadeHref(geom)}" x="0" y="0" width="${MAP_SIZE_M}" height="${MAP_SIZE_M}" preserveAspectRatio="none"/>`,
    );
  }

  for (const f of def.features) if (f.kind === "sea") layers.push(seaSVG(f, geom.seed));

  // topographic contours: one continuous line per 30 m level (§2.2)
  const maxIso = Math.ceil(geom.maxLevel + 1);
  for (let level = 1; level <= maxIso; level++) {
    const iso = level - 0.5;
    for (const line of contoursAt(geom.heightAt, iso, 96)) {
      if (line.length < 4) continue;
      layers.push(
        `<path d="${polyPath(chaikin(line))}" fill="none" stroke="${HILL_LINE}"
          stroke-width="${level === 1 ? 20 : 15}" stroke-opacity="${0.6 + 0.08 * level}" stroke-linejoin="round"/>`,
      );
    }
  }

  for (const w of geom.woods) layers.push(woodsSVG(w, geom.seed));
  for (const r of geom.rivers) layers.push(riverSVG(r));

  if (opts.camps !== false) {
    // §3.2 — Player 1 (white) camps south, Player 2 (black) north
    const south = CAMPS.south;
    const north = CAMPS.north;
    layers.push(`<polygon points="${argeadStarPoints(south.x, south.y, 240)}"
      fill="#f2ecde" fill-opacity="0.95" stroke="#3a3128" stroke-width="10"/>`);
    layers.push(`<polygon points="${argeadStarPoints(north.x, north.y, 240)}"
      fill="#16100a" fill-opacity="0.95" stroke="#caa06a" stroke-width="10"/>`);
  }

  if (opts.scaleBar !== false) {
    layers.push(`<g stroke="${INK}" stroke-width="18">
      <line x1="260" y1="5760" x2="1260" y2="5760"/>
      <line x1="260" y1="5700" x2="260" y2="5820"/>
      <line x1="1260" y1="5700" x2="1260" y2="5820"/>
    </g>
    <text x="360" y="5660" font-family="Georgia, serif" font-size="170" fill="${INK}">1 km</text>`);
  }

  layers.push(`<rect x="15" y="15" width="${MAP_SIZE_M - 30}" height="${MAP_SIZE_M - 30}"
    fill="none" stroke="${INK}" stroke-width="30"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_SIZE_M} ${MAP_SIZE_M}">${layers.join("")}</svg>`;
}
