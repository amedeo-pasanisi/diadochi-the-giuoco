import { MAP_SIZE_M, type BattlefieldDef } from "../../engine/battlefield";
import {
  corners,
  facing,
  glyphOf,
  rightward,
  GENERAL_RADIUS,
  type FieldGeneral,
  type FieldUnit,
} from "../../engine/field";
import type { Zone } from "../../engine/deployment";
import type { PlayerId } from "../../engine/types";
import { renderMapSVG } from "../art/mapArt";
import { argeadStarPoints } from "../art/ornaments";
import type { Camera } from "./camera";

/**
 * Canvas renderer for the battlefield (§3.3–3.4): the papyrus map as a
 * cached bitmap, deployment strips, unit rectangles with all their
 * markings, generals as Argead stars. Deployment and battle share it.
 */

/* player palettes: P1 white, P2 black (§3.2) */
const P1_FILL = "rgba(242,236,222,0.92)";
const P2_FILL = "rgba(24,18,13,0.94)";
const P1_EDGE = "#3a3128";
const P2_EDGE = "#caa06a";
const CAV_HALF = "rgba(150,141,128,0.9)"; // the grey half of cavalry (§3.3)
const SELECT = "rgba(80,200,90,0.95)"; // faint green selection (§3.5)

const mapCache = new Map<string, HTMLImageElement>();

/** Rasterize the SVG map once per battlefield. */
export function loadMapImage(def: BattlefieldDef, onReady: () => void): HTMLImageElement {
  const hit = mapCache.get(def.id);
  if (hit) return hit;
  const img = new Image();
  const blob = new Blob([renderMapSVG(def, { scaleBar: false })], { type: "image/svg+xml" });
  img.onload = () => {
    URL.revokeObjectURL(img.src);
    onReady();
  };
  img.src = URL.createObjectURL(blob);
  mapCache.set(def.id, img);
  return img;
}

export interface GhostUnit {
  x: number;
  y: number;
  angle: number;
  valid: boolean;
}

export interface SceneLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  dash?: number[];
}

export interface FieldScene {
  def: BattlefieldDef;
  cam: Camera;
  units: FieldUnit[];
  generals: FieldGeneral[];
  /** Deployment strips to overlay, if any. */
  zones?: { zone: Zone; player: PlayerId; emphasis: boolean }[];
  selected?: Set<number>;
  generalSelected?: boolean;
  ghosts?: GhostUnit[];
  /** World-space overlay lines (order arrows, projections). */
  lines?: SceneLine[];
  /** Screen-space selection box, if dragging one. */
  selectBox?: { x0: number; y0: number; x1: number; y1: number };
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: FieldScene): void {
  const { cam } = scene;
  ctx.save();
  ctx.fillStyle = "#0d0a07";
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);

  // map bitmap under camera transform
  const img = loadMapImage(scene.def, () => undefined);
  ctx.save();
  ctx.translate(cam.viewW / 2, cam.viewH / 2);
  ctx.rotate(cam.rot);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.cx, -cam.cy);
  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, 0, 0, MAP_SIZE_M, MAP_SIZE_M);
  } else {
    ctx.fillStyle = "#d3b87e";
    ctx.fillRect(0, 0, MAP_SIZE_M, MAP_SIZE_M);
  }

  // deployment strips (§3.2): translucent white / black
  if (scene.zones) {
    for (const z of scene.zones) {
      ctx.fillStyle =
        z.player === 0
          ? `rgba(255,255,255,${z.emphasis ? 0.22 : 0.1})`
          : `rgba(0,0,0,${z.emphasis ? 0.28 : 0.14})`;
      ctx.fillRect(z.zone.x0, z.zone.y0, z.zone.x1 - z.zone.x0, z.zone.y1 - z.zone.y0);
      ctx.strokeStyle = z.player === 0 ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.55)";
      ctx.lineWidth = 12;
      ctx.strokeRect(z.zone.x0, z.zone.y0, z.zone.x1 - z.zone.x0, z.zone.y1 - z.zone.y0);
    }
  }

  if (scene.lines) {
    for (const l of scene.lines) {
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.width;
      ctx.setLineDash(l.dash ?? []);
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  for (const u of scene.units) {
    drawUnit(ctx, u, scene.selected?.has(u.uid) === true);
  }
  if (scene.ghosts) {
    for (const g of scene.ghosts) drawGhost(ctx, g);
  }
  for (const g of scene.generals) drawGeneral(ctx, g, scene.generalSelected === true, scene.units);

  ctx.restore();

  // screen-space selection box
  if (scene.selectBox) {
    const b = scene.selectBox;
    ctx.strokeStyle = SELECT;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(
      Math.min(b.x0, b.x1),
      Math.min(b.y0, b.y1),
      Math.abs(b.x1 - b.x0),
      Math.abs(b.y1 - b.y0),
    );
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/* ---------- units (§3.3) ---------- */

function drawUnit(ctx: CanvasRenderingContext2D, u: FieldUnit, selected: boolean): void {
  const g = glyphOf(u.unit);
  const c = corners(u);
  const fill = u.player === 0 ? P1_FILL : P2_FILL;
  const edge = u.player === 0 ? P1_EDGE : P2_EDGE;
  const ink = u.player === 0 ? P1_EDGE : P2_EDGE;

  const rectPath = (): void => {
    ctx.beginPath();
    ctx.moveTo(...c.tl);
    ctx.lineTo(...c.tr);
    ctx.lineTo(...c.br);
    ctx.lineTo(...c.bl);
    ctx.closePath();
  };

  ctx.save();

  if (g.special) {
    // §3.3 special units: four ogives in an INVISIBLE rectangle.
    // Selection lights the ogives themselves.
    drawOgives(ctx, u, selected ? SELECT : ink, selected);
  } else {
    rectPath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (g.cavalry) {
      // §3.3 cavalry: cut by a diagonal, second half grey
      ctx.save();
      ctx.clip();
      ctx.fillStyle = CAV_HALF;
      ctx.beginPath();
      ctx.moveTo(...c.tl);
      ctx.lineTo(...c.br);
      ctx.lineTo(...c.bl);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // selection lights the unit's own outline — dashed for lights
    rectPath();
    ctx.strokeStyle = selected ? SELECT : edge;
    ctx.lineWidth = selected ? 11 : 7;
    ctx.setLineDash(g.light ? [22, 16] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // §3.3 elite: small "+" at the centre
  if (g.elite) {
    ctx.strokeStyle = u.player === 0 ? "#7a5a20" : "#e0b25e";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(u.x - 22, u.y);
    ctx.lineTo(u.x + 22, u.y);
    ctx.moveTo(u.x, u.y - 22);
    ctx.lineTo(u.x, u.y + 22);
    ctx.stroke();
  }

  // §3.3 sarissas/spears: lines projecting from the front
  if (g.shaft !== "none") {
    const len = g.shaft === "pike" ? 50 : 25;
    const [fx, fy] = facing(u);
    const [rx, ry] = rightward(u);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
      const bx = u.x + fx * 50 + rx * i * 28;
      const by = u.y + fy * 50 + ry * i * 28;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + fx * len, by + fy * len);
    }
    ctx.stroke();
  }

  drawStatusMarks(ctx, u, ink);
  ctx.restore();
}

function drawOgives(ctx: CanvasRenderingContext2D, u: FieldUnit, ink: string, bold = false): void {
  const [rx, ry] = rightward(u);
  ctx.strokeStyle = ink;
  ctx.lineWidth = bold ? 12 : 9;
  for (let i = 0; i < 4; i++) {
    const t = (i - 1.5) * 46;
    const cx = u.x + rx * t;
    const cy = u.y + ry * t;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 14, 34, u.angle, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * §3.3 corner marks — casualties TL (vertical dashes), disorder TR
 * ("s"), fatigue BL ("/"), morale BR (small ogives).
 */
function drawStatusMarks(ctx: CanvasRenderingContext2D, u: FieldUnit, ink: string): void {
  const c = corners(u);
  const [fx, fy] = facing(u);
  const [rx, ry] = rightward(u);
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 5;

  // casualties at TL: vertical dashes stepping inward along the front
  for (let i = 0; i < u.casualties; i++) {
    const x = c.tl[0] + rx * (26 + i * 20) - fx * 22;
    const y = c.tl[1] + ry * (26 + i * 20) - fy * 22;
    ctx.beginPath();
    ctx.moveTo(x - fx * 9, y - fy * 9);
    ctx.lineTo(x + fx * 9, y + fy * 9);
    ctx.stroke();
  }
  // disorder at TR: little "s" glyphs
  ctx.font = "34px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < u.disorder; i++) {
    const x = c.tr[0] - rx * (26 + i * 22) - fx * 24;
    const y = c.tr[1] - ry * (26 + i * 22) - fy * 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(u.angle);
    ctx.fillText("s", 0, 0);
    ctx.restore();
  }
  // fatigue at BL: "/" strokes
  const fatigueLevels = fatigueLevelOf(u);
  for (let i = 0; i < fatigueLevels; i++) {
    const x = c.bl[0] + rx * (24 + i * 20) + fx * 22;
    const y = c.bl[1] + ry * (24 + i * 20) + fy * 22;
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 9);
    ctx.lineTo(x + 8, y - 9);
    ctx.stroke();
  }
  // morale at BR: small ogives in red so they read at a glance
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#d24a2e";
  ctx.fillStyle = "rgba(210,74,46,0.55)";
  for (let i = 0; i < u.morale; i++) {
    const x = c.br[0] - rx * (22 + i * 22) + fx * 22;
    const y = c.br[1] - ry * (22 + i * 22) + fy * 22;
    ctx.beginPath();
    ctx.ellipse(x, y, 6, 11, u.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Placeholder until the battle module owns fatigue level math (§4.3.3). */
function fatigueLevelOf(u: FieldUnit): number {
  void u;
  return 0;
}

function drawGhost(ctx: CanvasRenderingContext2D, g: GhostUnit): void {
  const c = corners(g);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(...c.tl);
  ctx.lineTo(...c.tr);
  ctx.lineTo(...c.br);
  ctx.lineTo(...c.bl);
  ctx.closePath();
  ctx.fillStyle = g.valid ? "rgba(80,200,90,0.25)" : "rgba(210,74,46,0.3)";
  ctx.strokeStyle = g.valid ? SELECT : "rgba(210,74,46,0.9)";
  ctx.lineWidth = 7;
  ctx.fill();
  ctx.stroke();
  // front tick so the ghost's facing is readable
  const [fx, fy] = facing(g);
  ctx.beginPath();
  ctx.moveTo(g.x + fx * 50, g.y + fy * 50);
  ctx.lineTo(g.x + fx * 90, g.y + fy * 90);
  ctx.stroke();
  ctx.restore();
}

/* ---------- the general (§3.4) ---------- */

const GOLD = "#e0b25e";

function drawGeneral(
  ctx: CanvasRenderingContext2D,
  g: FieldGeneral,
  selected: boolean,
  units: FieldUnit[],
): void {
  let x = g.x;
  let y = g.y;
  let radius = GENERAL_RADIUS;
  if (g.attachedTo !== null) {
    const host = units.find((u) => u.uid === g.attachedTo);
    if (!host) return;
    x = host.x;
    y = host.y;
    radius = GENERAL_RADIUS * 0.6; // slightly smaller star at unit centre (§3.4)
  }

  ctx.save();
  // the gold command ring marks him out from any camp or unit marking
  ctx.strokeStyle = selected ? SELECT : GOLD;
  ctx.lineWidth = selected ? 10 : 7;
  ctx.beginPath();
  ctx.arc(x, y, radius + 16, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = GOLD;
  ctx.strokeStyle = g.player === 0 ? P1_EDGE : "#16100a";
  ctx.lineWidth = 4;
  const pts = argeadStarPoints(x, y, radius).split(" ");
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [px, py] = p.split(",").map(Number);
    if (i === 0) ctx.moveTo(px!, py!);
    else ctx.lineTo(px!, py!);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
