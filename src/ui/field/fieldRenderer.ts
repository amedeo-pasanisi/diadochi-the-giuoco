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
const P2_EDGE = "#f2ecde";
const CAV_HALF = "rgba(150,141,128,0.9)"; // the grey half of cavalry (§3.3)
const SELECT = "rgba(196,92,255,0.95)"; // fluorescent violet selection
const SELECT_FILL = "rgba(196,92,255,0.22)";
const BAD_MARK = "#d24a2e"; // casualties, disorder, fatigue
const MORALE_COLORS: Record<number, string> = { 3: "#3f9e4d", 2: "#e0b25e", 1: "#d24a2e" };

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
  /** The general's projection is a circle, like his star. */
  circle?: boolean;
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

export interface SceneFx {
  kind: "shoot" | "clash" | "casualty" | "morale" | "disorder" | "rout";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  /** 0..1 age of the effect; 0 = just fired, 1 = about to vanish. */
  age: number;
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
  /** Combat effects (playback). */
  fx?: SceneFx[];
  /** Translucent units under the main layer (Glance-phase preview). */
  ghostUnits?: FieldUnit[];
  /** Screen-space selection box, if dragging one. */
  selectBox?: { x0: number; y0: number; x1: number; y1: number };
  /** The void around the map — swaps with the turn theme. */
  backdrop?: string;
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: FieldScene): void {
  const { cam } = scene;
  ctx.save();
  ctx.fillStyle = scene.backdrop ?? "#0d0a07";
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

  // Glance-phase translucent preview beneath the live units
  if (scene.ghostUnits) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    for (const u of scene.ghostUnits) drawUnit(ctx, u, false);
    ctx.restore();
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

  if (scene.fx) {
    for (const f of scene.fx) drawFx(ctx, f);
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
  // solid figures in the player's colour, not hollow outlines
  ctx.fillStyle = u.player === 0 ? P1_FILL : P2_FILL;
  ctx.strokeStyle = ink;
  ctx.lineWidth = bold ? 10 : 6;
  for (let i = 0; i < 4; i++) {
    const t = (i - 1.5) * 46;
    const cx = u.x + rx * t;
    const cy = u.y + ry * t;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 15, 35, u.angle, 0, Math.PI * 2);
    ctx.fill();
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
  // the bad news is always written in red
  ctx.strokeStyle = BAD_MARK;
  ctx.fillStyle = BAD_MARK;
  ctx.lineWidth = 5;
  void ink;

  // casualties at TL: vertical dashes stepping inward along the front
  for (let i = 0; i < u.casualties; i++) {
    const x = c.tl[0] + rx * (26 + i * 20) - fx * 22;
    const y = c.tl[1] + ry * (26 + i * 20) - fy * 22;
    ctx.beginPath();
    ctx.moveTo(x - fx * 9, y - fy * 9);
    ctx.lineTo(x + fx * 9, y + fy * 9);
    ctx.stroke();
  }
  // disorder at TR: stylized serpentine marks
  for (let i = 0; i < u.disorder; i++) {
    const x = c.tr[0] - rx * (26 + i * 22) - fx * 24;
    const y = c.tr[1] - ry * (26 + i * 22) - fy * 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(u.angle);
    ctx.beginPath();
    ctx.moveTo(6, -10);
    ctx.bezierCurveTo(-9, -8, 9, 8, -6, 10);
    ctx.lineWidth = 4.5;
    ctx.stroke();
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
  // morale at BR: traffic-light dots — green at 3, yellow at 2, red at 1
  const moraleColor = MORALE_COLORS[Math.max(1, Math.min(3, u.morale))] ?? "#d24a2e";
  ctx.fillStyle = moraleColor;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i < u.morale; i++) {
    const x = c.br[0] - rx * (22 + i * 22) + fx * 22;
    const y = c.br[1] - ry * (22 + i * 22) + fy * 22;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
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
  ctx.save();
  ctx.fillStyle = g.valid ? SELECT_FILL : "rgba(210,74,46,0.3)";
  ctx.strokeStyle = g.valid ? SELECT : "rgba(210,74,46,0.9)";
  ctx.lineWidth = 7;
  if (g.circle) {
    ctx.beginPath();
    ctx.arc(g.x, g.y, GENERAL_RADIUS + 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    const c = corners(g);
    ctx.beginPath();
    ctx.moveTo(...c.tl);
    ctx.lineTo(...c.tr);
    ctx.lineTo(...c.br);
    ctx.lineTo(...c.bl);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // front tick so the ghost's facing is readable
  const [fx, fy] = facing(g);
  ctx.beginPath();
  ctx.moveTo(g.x + fx * 50, g.y + fy * 50);
  ctx.lineTo(g.x + fx * 90, g.y + fy * 90);
  ctx.stroke();
  ctx.restore();
}

/** Combat effects, drawn in world coordinates during playback. */
function drawFx(ctx: CanvasRenderingContext2D, f: SceneFx): void {
  const fade = 1 - f.age;
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  switch (f.kind) {
    case "shoot": {
      // a volley streak from shooter to target
      ctx.strokeStyle = "#3a2c18";
      ctx.lineWidth = 4;
      ctx.setLineDash([26, 22]);
      ctx.lineDashOffset = -f.age * 90;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x2 ?? f.x, f.y2 ?? f.y);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "clash": {
      // an expanding shock ring plus a spark burst
      const r = 30 + f.age * 90;
      ctx.strokeStyle = "#e8b34a";
      ctx.lineWidth = 8 * fade;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#f4e6c0";
      ctx.lineWidth = 4;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(a) * 18, f.y + Math.sin(a) * 18);
        ctx.lineTo(f.x + Math.cos(a) * (34 + f.age * 26), f.y + Math.sin(a) * (34 + f.age * 26));
        ctx.stroke();
      }
      break;
    }
    case "casualty": {
      const r = 22 + f.age * 60;
      ctx.fillStyle = "#8a1f10";
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "morale": {
      // sinking blue chevrons
      ctx.strokeStyle = "#5a7fa0";
      ctx.lineWidth = 6 * fade;
      const dy = f.age * 40;
      ctx.beginPath();
      ctx.moveTo(f.x - 22, f.y - 10 + dy);
      ctx.lineTo(f.x, f.y + 6 + dy);
      ctx.lineTo(f.x + 22, f.y - 10 + dy);
      ctx.stroke();
      break;
    }
    case "disorder": {
      ctx.strokeStyle = "#b06a2e";
      ctx.lineWidth = 5 * fade;
      const r = 26 + f.age * 20;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.4) {
        const rr = r + Math.sin(a * 5 + f.age * 8) * 8;
        const x = f.x + Math.cos(a) * rr;
        const y = f.y + Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    }
    case "rout": {
      ctx.strokeStyle = "#d24a2e";
      ctx.lineWidth = 7 * fade;
      const r = 40 + f.age * 120;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }
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
