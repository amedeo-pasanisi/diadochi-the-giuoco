import type { PlayerId, UnitId } from "./types";
import { UNIT_DEFS } from "./data/units";

/* ============================================================
   §3.3–3.4 — units on the field. A unit is a 200 m × 100 m
   rectangle with a facing; the general is a 100 m star.
   Angle convention: 0 = facing north (toward -y), growing
   clockwise, so P2's initial facing is π (south).
   ============================================================ */

export const UNIT_HALF_W = 100; // half of the 200 m front
export const UNIT_HALF_D = 50; // half of the 100 m depth
export const GENERAL_RADIUS = 50; // §3.4 — 100 m circle

/** A unit instance on the field (deployment and battle share this). */
export interface FieldUnit {
  uid: number;
  unit: UnitId;
  player: PlayerId;
  x: number;
  y: number;
  /** Facing in radians; 0 = north, clockwise positive. */
  angle: number;
  morale: number; // levels, base 3 (§4.3.6)
  fatigue: number; // continuous gauge spent, 0..endurance (§4.3.3)
  disorder: number; // levels 0..3
  casualties: number; // levels 0..3 (4th removes the unit)
}

export interface FieldGeneral {
  player: PlayerId;
  x: number;
  y: number;
  /** uid of the unit he is attached to, or null when on his own (§3.4). */
  attachedTo: number | null;
}

export function makeFieldUnit(
  uid: number,
  unit: UnitId,
  player: PlayerId,
  x: number,
  y: number,
  angle: number,
): FieldUnit {
  return { uid, unit, player, x, y, angle, morale: 3, fatigue: 0, disorder: 0, casualties: 0 };
}

/** Unit facing as a vector (front direction). */
export function facing(u: { angle: number }): [number, number] {
  return [Math.sin(u.angle), -Math.cos(u.angle)];
}

/** Right-hand direction along the unit's front. */
export function rightward(u: { angle: number }): [number, number] {
  return [Math.cos(u.angle), Math.sin(u.angle)];
}

export interface Corners {
  tl: [number, number];
  tr: [number, number];
  bl: [number, number];
  br: [number, number];
}

/** §3.3 — TL/TR are the front corners, BL/BR the rear. */
export function corners(u: { x: number; y: number; angle: number }): Corners {
  const [fx, fy] = facing(u);
  const [rx, ry] = rightward(u);
  const fdx = fx * UNIT_HALF_D;
  const fdy = fy * UNIT_HALF_D;
  const rwx = rx * UNIT_HALF_W;
  const rwy = ry * UNIT_HALF_W;
  return {
    tl: [u.x + fdx - rwx, u.y + fdy - rwy],
    tr: [u.x + fdx + rwx, u.y + fdy + rwy],
    bl: [u.x - fdx - rwx, u.y - fdy - rwy],
    br: [u.x - fdx + rwx, u.y - fdy + rwy],
  };
}

export function frontCenter(u: { x: number; y: number; angle: number }): [number, number] {
  const [fx, fy] = facing(u);
  return [u.x + fx * UNIT_HALF_D, u.y + fy * UNIT_HALF_D];
}

/** Point-in-unit test (oriented rectangle). */
export function containsPoint(u: { x: number; y: number; angle: number }, px: number, py: number): boolean {
  const [fx, fy] = facing(u);
  const [rx, ry] = rightward(u);
  const dx = px - u.x;
  const dy = py - u.y;
  const df = dx * fx + dy * fy;
  const dr = dx * rx + dy * ry;
  return Math.abs(df) <= UNIT_HALF_D && Math.abs(dr) <= UNIT_HALF_W;
}

/** Oriented-rectangle overlap via separating axes. */
export function unitsOverlap(
  a: { x: number; y: number; angle: number },
  b: { x: number; y: number; angle: number },
): boolean {
  const ca = corners(a);
  const cb = corners(b);
  const pa = [ca.tl, ca.tr, ca.br, ca.bl];
  const pb = [cb.tl, cb.tr, cb.br, cb.bl];
  for (const rect of [pa, pb]) {
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = rect[i]!;
      const [x2, y2] = rect[(i + 1) % 4]!;
      const ax = y2 - y1;
      const ay = x1 - x2; // normal of the edge
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const [px, py] of pa) {
        const p = px * ax + py * ay;
        minA = Math.min(minA, p);
        maxA = Math.max(maxA, p);
      }
      for (const [px, py] of pb) {
        const p = px * ax + py * ay;
        minB = Math.min(minB, p);
        maxB = Math.max(maxB, p);
      }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

/** All four corners inside an axis-aligned rectangle? */
export function unitInsideRect(
  u: { x: number; y: number; angle: number },
  rect: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  const c = corners(u);
  for (const [px, py] of [c.tl, c.tr, c.bl, c.br]) {
    if (px < rect.x0 || px > rect.x1 || py < rect.y0 || py > rect.y1) return false;
  }
  return true;
}

/* ---------- §3.3 render-classification helpers ---------- */

export type UnitGlyph = {
  cavalry: boolean;
  light: boolean;
  elite: boolean;
  special: boolean;
  shaft: "pike" | "spear" | "none";
};

export function glyphOf(unit: UnitId): UnitGlyph {
  const def = UNIT_DEFS[unit];
  return {
    cavalry: def.arm === "cavalry",
    light: def.weight === "light",
    elite: def.elite === true,
    special: def.arm === "special",
    shaft: def.shaft,
  };
}
