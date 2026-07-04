import type { PlayerId } from "./types";
import { GENERAL_DEFS } from "./data/generals";
import { totalSpent, type SelectionState } from "./recruitment";
import type { Rng } from "./rng";

/* ============================================================
   §2 — Battlefields: the contest for choice of ground, and the
   three maps as pure terrain data (also consumed by the battle
   sim in Milestone III via the query helpers below).
   Coordinates are metres; x grows east, y grows south.
   ============================================================ */

export const MAP_SIZE_M = 6000;
/** Camps: Argead star in an invisible 500 m square (§2.2). P1 south (§3.2). */
export const CAMP_HALF_M = 250;
export const CAMPS: Record<"north" | "south", { x: number; y: number }> = {
  north: { x: 3000, y: 400 },
  south: { x: 3000, y: 5600 },
};
/** One altitude ring = 30 m of elevation (§2.2). */
export const RING_ELEVATION_M = 30;

export type BattlefieldId = "gaugamela" | "chaironeia" | "issus";

export interface HillFeature {
  kind: "hill";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Number of 30 m rings — the peak sits at this elevation level. */
  levels: number;
}
export interface WoodsFeature {
  kind: "woods";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
export interface RiverFeature {
  kind: "river";
  points: [number, number][];
  /** Width in metres, 30–200 (§2.2). */
  width: number;
}
/** Sea strip along the western edge (Issus). Impassable. */
export interface SeaFeature {
  kind: "sea";
  width: number;
}
export type TerrainFeature = HillFeature | WoodsFeature | RiverFeature | SeaFeature;

export interface BattlefieldDef {
  id: BattlefieldId;
  name: string;
  blurb: string;
  features: TerrainFeature[];
}

export const BATTLEFIELDS: Record<BattlefieldId, BattlefieldDef> = {
  // §2.3 — almost entirely plain; rough ground only at the extreme edges.
  gaugamela: {
    id: "gaugamela",
    name: "Gaugamela",
    blurb: "An open plain without end. Nowhere to hide, nowhere to anchor a flank — numbers and nerve decide.",
    features: [
      { kind: "hill", cx: 150, cy: 1500, rx: 600, ry: 950, levels: 1 },
      { kind: "hill", cx: 80, cy: 3700, rx: 520, ry: 1100, levels: 1 },
      { kind: "hill", cx: 5880, cy: 2100, rx: 560, ry: 1000, levels: 1 },
      { kind: "hill", cx: 5920, cy: 4400, rx: 620, ry: 950, levels: 1 },
      { kind: "hill", cx: 5600, cy: 500, rx: 520, ry: 420, levels: 1 },
    ],
  },
  // §2.3 — narrow river valley: rugged hills east and west, a ~2 km
  // north-south plain between, cut by a small river hugging the east.
  chaironeia: {
    id: "chaironeia",
    name: "Chaironeia",
    blurb: "A narrow valley where phalanxes grind head-on. Little room for wings, none for second thoughts.",
    features: [
      { kind: "hill", cx: 700, cy: 1000, rx: 1250, ry: 1350, levels: 4 },
      { kind: "hill", cx: 500, cy: 3000, rx: 1450, ry: 1550, levels: 5 },
      { kind: "hill", cx: 750, cy: 5000, rx: 1300, ry: 1350, levels: 4 },
      { kind: "hill", cx: 5300, cy: 900, rx: 1250, ry: 1300, levels: 4 },
      { kind: "hill", cx: 5500, cy: 3000, rx: 1400, ry: 1600, levels: 5 },
      { kind: "hill", cx: 5250, cy: 5100, rx: 1300, ry: 1250, levels: 4 },
      { kind: "woods", cx: 1750, cy: 2050, rx: 360, ry: 500 },
      { kind: "woods", cx: 4350, cy: 4300, rx: 380, ry: 460 },
      { kind: "woods", cx: 1850, cy: 4500, rx: 300, ry: 380 },
      {
        kind: "river",
        points: [
          [3680, 0],
          [3560, 1200],
          [3680, 2600],
          [3580, 4000],
          [3680, 5300],
          [3620, 6000],
        ],
        width: 50,
      },
    ],
  },
  // §2.3 — sea to the west, an east-west river across the middle, hills
  // to the east, and a ~3 km plain between sea and hills. (The doc says
  // "hills to the west", but with the sea west and the plain between
  // sea and hills, the hills must lie east — as at the historical Issus.)
  issus: {
    id: "issus",
    name: "Issus",
    blurb: "Sea on one flank, heights on the other — a killing corridor by the river, too narrow for a horde.",
    features: [
      { kind: "sea", width: 900 },
      {
        kind: "river",
        points: [
          [900, 3060],
          [2200, 2950],
          [3600, 3090],
          [4600, 2980],
          [6000, 3010],
        ],
        width: 80,
      },
      { kind: "hill", cx: 5550, cy: 1200, rx: 1550, ry: 1450, levels: 3 },
      { kind: "hill", cx: 5700, cy: 3200, rx: 1650, ry: 1600, levels: 4 },
      { kind: "hill", cx: 5500, cy: 5000, rx: 1500, ry: 1350, levels: 3 },
      { kind: "woods", cx: 4250, cy: 4550, rx: 330, ry: 420 },
      { kind: "woods", cx: 4150, cy: 1450, rx: 300, ry: 380 },
    ],
  },
};

export const BATTLEFIELD_ORDER: BattlefieldId[] = ["gaugamela", "chaironeia", "issus"];

/* ---------- terrain queries (used by the battle sim) ---------- */

function insideEllipse(x: number, y: number, f: { cx: number; cy: number; rx: number; ry: number }): number {
  const dx = (x - f.cx) / f.rx;
  const dy = (y - f.cy) / f.ry;
  return Math.hypot(dx, dy); // < 1 means inside; value is normalized distance
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1)));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

/** Elevation in 30 m levels at a point (0 = plain). */
export function elevationLevelAt(def: BattlefieldDef, x: number, y: number): number {
  let best = 0;
  for (const f of def.features) {
    if (f.kind !== "hill") continue;
    const d = insideEllipse(x, y, f);
    if (d < 1) best = Math.max(best, Math.ceil((1 - d) * f.levels));
  }
  return best;
}

export interface TerrainSample {
  elevation: number;
  woods: boolean;
  river: boolean;
  sea: boolean;
}

export function terrainAt(def: BattlefieldDef, x: number, y: number): TerrainSample {
  let woods = false;
  let river = false;
  let sea = false;
  for (const f of def.features) {
    if (f.kind === "woods" && insideEllipse(x, y, f) < 1) woods = true;
    else if (f.kind === "sea" && x <= f.width) sea = true;
    else if (f.kind === "river") {
      for (let i = 0; i < f.points.length - 1; i++) {
        const [ax, ay] = f.points[i]!;
        const [bx, by] = f.points[i + 1]!;
        if (distToSegment(x, y, ax, ay, bx, by) <= f.width / 2) {
          river = true;
          break;
        }
      }
    }
  }
  return { elevation: elevationLevelAt(def, x, y), woods, river, sea };
}

/* ---------- §2.1 — the contest for choice of ground ---------- */

export interface ContestSide {
  player: PlayerId;
  general: string;
  /** The better of Command and Brilliancy. */
  base: number;
  usedStat: "command" | "brilliancy";
  die: number;
  total: number;
  spent: number;
}

export interface ContestResult {
  sides: [ContestSide, ContestSide];
  chooser: PlayerId;
  decidedBy: "roll" | "spent";
  /** Times both total AND spent tied, forcing a fresh throw. */
  rerolls: number;
}

export function battlefieldContest(
  armies: [SelectionState, SelectionState],
  rng: Rng,
): ContestResult {
  const mk = (p: PlayerId, die: number): ContestSide => {
    const sel = armies[p];
    const g = GENERAL_DEFS[sel.general!];
    const usedStat = g.brilliancy > g.command ? "brilliancy" : "command";
    const base = Math.max(g.command, g.brilliancy);
    return { player: p, general: g.name, base, usedStat, die, total: base + die, spent: totalSpent(sel) };
  };

  for (let rerolls = 0; ; rerolls++) {
    const a = mk(0, rng.d6());
    const b = mk(1, rng.d6());
    if (a.total !== b.total) {
      return { sides: [a, b], chooser: a.total > b.total ? 0 : 1, decidedBy: "roll", rerolls };
    }
    // Tie: the player who spent fewer talents chooses (§2.1).
    if (a.spent !== b.spent) {
      return { sides: [a, b], chooser: a.spent < b.spent ? 0 : 1, decidedBy: "spent", rerolls };
    }
    // Total tie on everything — throw again (gap-fill).
  }
}
