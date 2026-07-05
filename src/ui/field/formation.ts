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
    // formation preserved: rotate & translate around the pivot
    const cx = sel.reduce((s, u) => s + u.x, 0) / sel.length;
    const cy = sel.reduce((s, u) => s + u.y, 0) / sel.length;
    const groupAngle = Math.atan2(
      sel.reduce((s, u) => s + Math.sin(u.angle), 0),
      sel.reduce((s, u) => s + Math.cos(u.angle), 0),
    );
    const rot = angle - groupAngle;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (const u of sel) {
      const ox = u.x - cx;
      const oy = u.y - cy;
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
  // §3.5: slots are claimed by proximity
  const remaining = [...sel];
  for (const slot of slots) {
    let bestIdx = 0;
    let bestD = Infinity;
    remaining.forEach((u, i) => {
      const d = Math.hypot(u.x - slot.x, u.y - slot.y);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    });
    out.set(remaining.splice(bestIdx, 1)[0]!.uid, slot);
  }
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
      color: "rgba(224,178,94,0.55)",
      width: 8,
    });
  }
  return lines;
}
