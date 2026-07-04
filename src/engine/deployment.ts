import type { PlayerId, UnitId } from "./types";
import { UNIT_DEFS } from "./data/units";
import { UNIT_ORDER } from "./data/units";
import type { SelectionState } from "./recruitment";
import { unitCount } from "./recruitment";
import {
  CAMPS,
  MAP_SIZE_M,
  terrainAt,
  type BattlefieldDef,
} from "./battlefield";
import {
  makeFieldUnit,
  unitInsideRect,
  unitsOverlap,
  type FieldGeneral,
  type FieldUnit,
} from "./field";

/* ============================================================
   §3.2 / §3.6 — deployment zones and placement rules.
   P1 camps south, P2 north. Each player has a small 4×1 km strip
   (heavy troops and the general) and a large 5×2 km strip that
   additionally admits light/skirmish troops and medium cavalry,
   reaching further east-west and toward the centre.
   ============================================================ */

export interface Zone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function smallZone(player: PlayerId): Zone {
  return player === 0
    ? { x0: 1000, y0: 4400, x1: 5000, y1: 5400 }
    : { x0: 1000, y0: 600, x1: 5000, y1: 1600 };
}

export function largeZone(player: PlayerId): Zone {
  return player === 0
    ? { x0: 500, y0: 3400, x1: 5500, y1: 5400 }
    : { x0: 500, y0: 600, x1: 5500, y1: 2600 };
}

/** §3.6 — who may use the large strip. */
export function allowedInLargeZone(unit: UnitId): boolean {
  const def = UNIT_DEFS[unit];
  return def.weight === "light" || (def.arm === "cavalry" && def.weight === "medium");
}

export interface DeploymentState {
  player: PlayerId;
  units: FieldUnit[];
  general: FieldGeneral;
}

/** A unit must sit fully inside its permitted strip (§3.6). */
export function unitZoneOk(
  def: BattlefieldDef,
  player: PlayerId,
  u: { x: number; y: number; angle: number; unit: UnitId },
): boolean {
  const zone = allowedInLargeZone(u.unit) ? largeZone(player) : smallZone(player);
  if (!unitInsideRect(u, zone)) return false;
  // no wading into the sea during deployment
  const t = terrainAt(def, u.x, u.y);
  return !t.sea;
}

/**
 * Per-unit placement verdicts: each moved unit must sit in its own
 * permitted strip (a formation drag can NEVER carry a heavy outside
 * the small rectangle) and overlap nothing.
 */
export function placementReport(
  def: BattlefieldDef,
  state: DeploymentState,
  moved: FieldUnit[],
): boolean[] {
  return moved.map((m) => {
    if (!unitZoneOk(def, state.player, m)) return false;
    for (const other of state.units) {
      if (moved.some((x) => x.uid === other.uid)) continue;
      if (unitsOverlap(m, other)) return false;
    }
    for (const sibling of moved) {
      if (sibling.uid !== m.uid && unitsOverlap(m, sibling)) return false;
    }
    return true;
  });
}

/** Full placement check — every moved unit must pass. */
export function placementOk(
  def: BattlefieldDef,
  state: DeploymentState,
  moved: FieldUnit[],
): boolean {
  return placementReport(def, state, moved).every(Boolean);
}

/** General stays inside the small strip (§3.6) — or in his camp (§3.4). */
export function generalZoneOk(player: PlayerId, x: number, y: number): boolean {
  const z = smallZone(player);
  if (x >= z.x0 + 50 && x <= z.x1 - 50 && y >= z.y0 + 50 && y <= z.y1 - 50) return true;
  const camp = player === 0 ? CAMPS.south : CAMPS.north;
  return Math.abs(x - camp.x) <= 200 && Math.abs(y - camp.y) <= 200;
}

/**
 * §3.3 — the mustered army starts massed by the camp: ranks of units
 * just inside the small strip, facing the enemy.
 */
export function initialDeployment(player: PlayerId, muster: SelectionState): DeploymentState {
  const camp = player === 0 ? CAMPS.south : CAMPS.north;
  const facingAngle = player === 0 ? 0 : Math.PI;
  const zone = smallZone(player);
  const units: FieldUnit[] = [];

  const roster: UnitId[] = [];
  for (const id of UNIT_ORDER) {
    for (let i = 0; i < unitCount(muster, id); i++) roster.push(id);
  }

  const perRow = 8;
  const gapX = 240;
  const gapY = 160;
  let uid = player * 1000 + 1;
  roster.forEach((id, i) => {
    const row = Math.floor(i / perRow);
    const inRow = i % perRow;
    const rowCount = Math.min(perRow, roster.length - row * perRow);
    const x = MAP_SIZE_M / 2 + (inRow - (rowCount - 1) / 2) * gapX;
    // ranks stack from the camp-side edge of the strip toward the centre
    const y = player === 0 ? zone.y1 - 100 - row * gapY : zone.y0 + 100 + row * gapY;
    units.push(makeFieldUnit(uid++, id, player, x, y, facingAngle));
  });

  return {
    player,
    units,
    general: { player, x: camp.x, y: camp.y, attachedTo: null },
  };
}
