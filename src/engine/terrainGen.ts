import type { BattlefieldDef, HillFeature, WoodsFeature } from "./battlefield";

/**
 * Deterministic terrain geometry, generated once per battlefield and
 * shared by BOTH the renderer and the battle sim — what you see on the
 * papyrus is exactly the ground the engine fights on.
 *
 * All randomness is hash-based (no RNG state), so every client
 * regenerates identical geometry from the battlefield id alone.
 */

/* ---------- hash noise ---------- */

function hashInt(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function hash01(seed: number, x: number, y: number): number {
  return hashInt(seed, x | 0, y | 0) / 4294967296;
}

/** Smooth value noise over a unit grid. */
export function valueNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash01(seed, ix, iy);
  const b = hash01(seed, ix + 1, iy);
  const c = hash01(seed, ix, iy + 1);
  const d = hash01(seed, ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal noise in [0,1]. */
export function fbm(seed: number, x: number, y: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(seed + o * 101, x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

function seedOf(id: string): number {
  let s = 7;
  for (let i = 0; i < id.length; i++) s = (Math.imul(s, 31) + id.charCodeAt(i)) >>> 0;
  return s;
}

/* ---------- geometry helpers ---------- */

export function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToPolyline(x: number, y: number, pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const abx = bx - ax;
    const aby = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby || 1)));
    best = Math.min(best, Math.hypot(x - (ax + abx * t), y - (ay + aby * t)));
  }
  return best;
}

/**
 * Midpoint-displacement meander: subdivide each leg, pushing midpoints
 * sideways by a hash-driven fraction of the leg length. Straight survey
 * lines become a natural winding course.
 */
export function meander(
  points: [number, number][],
  seed: number,
  iterations = 3,
  amplitude = 0.32,
): [number, number][] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    const out: [number, number][] = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[i + 1]!;
      const len = Math.hypot(bx - ax, by - ay);
      const px = -(by - ay) / (len || 1);
      const py = (bx - ax) / (len || 1);
      const off = (hash01(seed + it * 977, i * 53 + it, Math.round(ax + by)) - 0.5) * len * amplitude;
      out.push([(ax + bx) / 2 + px * off, (ay + by) / 2 + py * off], pts[i + 1]!);
    }
    pts = out;
  }
  return pts;
}

/** Organic blob outline for a woods patch (radial fbm modulation). */
export function woodsPolygon(f: WoodsFeature, seed: number): [number, number][] {
  const verts = 26;
  const poly: [number, number][] = [];
  for (let k = 0; k < verts; k++) {
    const th = (k / verts) * Math.PI * 2;
    const wobble = 1 + (fbm(seed, Math.cos(th) * 1.6 + 13.7, Math.sin(th) * 1.6 + 4.2, 3) - 0.5) * 0.8;
    poly.push([f.cx + Math.cos(th) * f.rx * wobble, f.cy + Math.sin(th) * f.ry * wobble]);
  }
  return poly;
}

/* ---------- the assembled geometry ---------- */

export interface RiverGeometry {
  points: [number, number][];
  width: number;
}
export interface WoodsGeometry {
  poly: [number, number][];
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface BattlefieldGeometry {
  seed: number;
  rivers: RiverGeometry[];
  woods: WoodsGeometry[];
  /** Elevation in 30 m levels (fractional) — 0 on the plain. */
  heightAt(x: number, y: number): number;
  /** Highest hill level on the map. */
  maxLevel: number;
}

const cache = new Map<string, BattlefieldGeometry>();

export function geometryOf(def: BattlefieldDef): BattlefieldGeometry {
  const hit = cache.get(def.id);
  if (hit) return hit;

  const seed = seedOf(def.id);
  const hills = def.features.filter((f): f is HillFeature => f.kind === "hill");
  const rivers: RiverGeometry[] = [];
  const woods: WoodsGeometry[] = [];
  let riverIdx = 0;
  let woodsIdx = 0;
  for (const f of def.features) {
    if (f.kind === "river") {
      rivers.push({ points: meander(f.points, seed + 1013 * ++riverIdx), width: f.width });
    } else if (f.kind === "woods") {
      woods.push({
        poly: woodsPolygon(f, seed + 2027 * ++woodsIdx),
        cx: f.cx,
        cy: f.cy,
        rx: f.rx,
        ry: f.ry,
      });
    }
  }

  const maxLevel = hills.reduce((m, h) => Math.max(m, h.levels), 0);
  const noiseSeed = (seed ^ 0x9e3779b9) >>> 0;

  const heightAt = (x: number, y: number): number => {
    let base = 0;
    for (const h of hills) {
      const d = Math.hypot((x - h.cx) / h.rx, (y - h.cy) / h.ry);
      if (d < 1) base = Math.max(base, h.levels * Math.pow(1 - d, 0.9));
    }
    if (base <= 0) return 0;
    // ruggedness: contour wiggle on the slopes, fading out at the plain
    const n = fbm(noiseSeed, x * 0.00105, y * 0.00105, 3);
    return Math.max(0, base + (n - 0.5) * 0.95 * Math.min(1, base));
  };

  const geom: BattlefieldGeometry = { seed, rivers, woods, heightAt, maxLevel };
  cache.set(def.id, geom);
  return geom;
}
