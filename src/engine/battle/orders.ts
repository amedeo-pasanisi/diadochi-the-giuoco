import type { PlayerId } from "../types";
import { corners, type FieldUnit } from "../field";
import { GENERAL_DEFS } from "../data/generals";
import type { GeneralId } from "../types";

/* ============================================================
   §4.1 — orders. Serializable objects: the whole command layer
   is data, ready for network play and the C# port.
   ============================================================ */

export type Order =
  | { type: "march"; dest: { x: number; y: number; angle: number }; fast: boolean }
  | { type: "attack"; targets: number[]; fast: boolean; secondary: boolean }
  | { type: "face"; targets: number[]; fast: boolean }
  | { type: "skirmish"; targets: number[]; fast: boolean }
  | { type: "avoid"; targets: number[]; fast: boolean }
  | {
      type: "wait";
      pct: 25 | 50 | 75 | 100;
      until: ("disorder" | "morale" | "fatigue")[];
    };

/** Any order that can be pushed to fast pace by a double right-click. */
export function canBeFast(o: Order): o is Extract<Order, { fast: boolean }> {
  return o.type !== "wait";
}

/** §4.1.1 — the base order pool: 3 + the general's Command. */
export function commandPool(general: GeneralId): number {
  return 3 + GENERAL_DEFS[general].command;
}

/** §4.2.1 — Glance-phase bonus orders. */
export function glancePool(general: GeneralId): number {
  return GENERAL_DEFS[general].glance;
}

/** §4.2.1 — Glance radius in metres. */
export const GLANCE_RADIUS = 500;

/** §4.1.3 / §4.2.1 — phase timers, in seconds. */
export const COMMAND_SECONDS = 120;
export const GLANCE_SECONDS = 60;

/** Minimum edge-to-edge distance between two unit rectangles (approx). */
export function unitGapM(a: FieldUnit, b: FieldUnit): number {
  const ca = corners(a);
  const cb = corners(b);
  const pa = [ca.tl, ca.tr, ca.br, ca.bl];
  const pb = [cb.tl, cb.tr, cb.br, cb.bl];
  let best = Infinity;
  for (const [ax, ay] of pa) {
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = pb[i]!;
      const [x2, y2] = pb[(i + 1) % 4]!;
      best = Math.min(best, distToSeg(ax, ay, x1, y1, x2, y2));
    }
  }
  for (const [bx, by] of pb) {
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = pa[i]!;
      const [x2, y2] = pa[(i + 1) % 4]!;
      best = Math.min(best, distToSeg(bx, by, x1, y1, x2, y2));
    }
  }
  return best;
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1)));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

/**
 * §4.1.1 — a multi-unit order costs one order per connected group,
 * where units chain together at up to 200 m apart.
 */
export function orderCost(units: FieldUnit[]): number {
  if (units.length <= 1) return units.length;
  const n = units.length;
  const parent = units.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (unitGapM(units[i]!, units[j]!) <= 200) {
        parent[find(i)] = find(j);
      }
    }
  }
  const roots = new Set<number>();
  for (let i = 0; i < n; i++) roots.add(find(i));
  return roots.size;
}

/** Per-player order bookkeeping for one phase. */
export interface OrderBudget {
  player: PlayerId;
  total: number;
  spent: number;
  brilliancyUsed: boolean;
}

export function remainingOrders(b: OrderBudget): number {
  return b.total - b.spent;
}
