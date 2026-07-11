import type { FieldUnit } from "../../engine/field";
import type { SceneLine } from "./fieldRenderer";
import { GLANCE_RADIUS } from "../../engine/battle/orders";

/**
 * §3.5 / §4.1.1 — the "perno" placement shared by deployment and the
 * battle order screen: the first right-click plants a pivot; dragging
 * lays the front line from that corner along the drag (facing the left
 * of the drag), formations fanning out with stretchable gaps. Shift
 * preserves the current formation instead.
 */

const UNIT_W = 200;
/** Formation continuity is 200 m (§4.1.1); stretching stops 25 m short. */
const MAX_GAP = 175;
const MIN_GAP = 20;

export interface PernoTarget {
  x: number;
  y: number;
  angle: number;
}

export function pernoTargets(
  sel: FieldUnit[],
  downW: [number, number],
  curW: [number, number],
  shift: boolean,
): Map<number, PernoTarget> {
  const out = new Map<number, PernoTarget>();
  if (sel.length === 0) return out;
  const [pwx, pwy] = downW;
  const [cwx, cwy] = curW;
  const dragLen = Math.hypot(cwx - pwx, cwy - pwy);

  if (dragLen <= 60) {
    // plain right-click: move, keeping each unit's facing
    if (sel.length === 1) {
      const u = sel[0]!;
      out.set(u.uid, { x: pwx, y: pwy, angle: u.angle });
    } else {
      const cx = sel.reduce((s, u) => s + u.x, 0) / sel.length;
      const cy = sel.reduce((s, u) => s + u.y, 0) / sel.length;
      for (const u of sel) {
        out.set(u.uid, { x: u.x + pwx - cx, y: u.y + pwy - cy, angle: u.angle });
      }
    }
    return out;
  }

  // the drag defines the front line from the pivot; the line faces the
  // LEFT of the drag, so dragging the other way faces rearward
  const ex = (cwx - pwx) / dragLen;
  const ey = (cwy - pwy) / dragLen;
  const fx = ey;
  const fy = -ex;
  const angle = Math.atan2(fx, -fy);

  if (shift && sel.length > 1) {
    // §3.5 method 2 — keep the formation's shape, but pivot on the
    // group's leading corner (as line mode does), not on its centre.
    // Find the unit nearest to the pivot corner of the group's bounding
    // box along the front axis, translate so it lands on the drag
    // start, then rotate the whole body to the drag's facing.
    const groupAngle = Math.atan2(
      sel.reduce((s, u) => s + Math.sin(u.angle), 0),
      sel.reduce((s, u) => s + Math.cos(u.angle), 0),
    );
    // rightward axis of the current formation
    const grx = Math.cos(groupAngle);
    const gry = Math.sin(groupAngle);
    // the "left" corner unit (min projection on the rightward axis)
    let anchor = sel[0]!;
    let bestProj = Infinity;
    for (const u of sel) {
      const proj = u.x * grx + u.y * gry;
      if (proj < bestProj) {
        bestProj = proj;
        anchor = u;
      }
    }
    const rot = angle - groupAngle;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (const u of sel) {
      const ox = u.x - anchor.x;
      const oy = u.y - anchor.y;
      out.set(u.uid, {
        x: pwx + ox * c - oy * s,
        y: pwy + ox * s + oy * c,
        angle: u.angle + rot,
      });
    }
    return out;
  }

  // line from the pivot corner, stretchable spacing
  const n = sel.length;
  let gap = MIN_GAP;
  if (n > 1) {
    gap = Math.max(MIN_GAP, Math.min(MAX_GAP, (dragLen - n * UNIT_W) / (n - 1)));
  }
  const slots = sel.map((_, i) => {
    const along = 100 + i * (UNIT_W + gap);
    return { x: pwx + ex * along - fx * 50, y: pwy + ey * along - fy * 50, angle };
  });
  // Assign units to slots so total travel is minimized. A full optimal
  // assignment is O(n^3); instead we project each unit onto the line's
  // axis and match sorted order to sorted slots, which is optimal for
  // points being placed along a line and avoids the "leftmost unit runs
  // to the rightmost slot" tangle.
  const along = (p: { x: number; y: number }): number => (p.x - pwx) * ex + (p.y - pwy) * ey;
  const unitsByAxis = [...sel].sort((a, b) => along(a) - along(b));
  const slotsByAxis = slots.map((s, i) => ({ s, i })).sort((a, b) => along(a.s) - along(b.s));
  unitsByAxis.forEach((u, k) => {
    out.set(u.uid, slotsByAxis[k]!.s);
  });
  return out;
}

/** The general's Glance radius as a dashed world-space ring. */
export function glanceRingLines(gx: number, gy: number): SceneLine[] {
  const lines: SceneLine[] = [];
  for (let i = 0; i < 36; i++) {
    const a1 = (i / 36) * Math.PI * 2;
    const a2 = ((i + 0.55) / 36) * Math.PI * 2;
    lines.push({
      x1: gx + Math.cos(a1) * GLANCE_RADIUS,
      y1: gy + Math.sin(a1) * GLANCE_RADIUS,
      x2: gx + Math.cos(a2) * GLANCE_RADIUS,
      y2: gy + Math.sin(a2) * GLANCE_RADIUS,
      color: "rgba(127,178,196,0.6)", // the Glance stat's own blue
      width: 8,
    });
  }
  return lines;
}
