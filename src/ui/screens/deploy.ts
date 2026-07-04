import { el } from "../dom";
import { applyMeander } from "../art/ornaments";
import { createTimer } from "../components/timer";
import { alalai, dismissThud, uiClick } from "../sound";
import { Camera } from "../field/camera";
import { drawScene, loadMapImage, type GhostUnit } from "../field/fieldRenderer";
import type { PlayerId } from "../../engine/types";
import type { BattlefieldDef } from "../../engine/battlefield";
import type { SelectionState } from "../../engine/recruitment";
import { DEPLOY_SECONDS } from "../../engine/recruitment";
import {
  generalZoneOk,
  initialDeployment,
  largeZone,
  placementOk,
  smallZone,
  type DeploymentState,
} from "../../engine/deployment";
import {
  containsPoint,
  corners,
  GENERAL_RADIUS,
  type FieldUnit,
} from "../../engine/field";

/**
 * §3 — the deployment phase. Wheel zooms, Q/E rotate the map, arrows
 * or middle-drag pan. Left-click selects (Shift adds); right-drag on
 * empty ground boxes a selection; right-click/drag places the
 * selection (drag rotating around TL/TR per §3.5, Shift preserving
 * formation). "Alalai!" ends the phase with a war cry (§3.7).
 */
export function deployScreen(
  player: PlayerId,
  def: BattlefieldDef,
  muster: SelectionState,
  onDone: (state: DeploymentState) => void,
): HTMLElement {
  const state = initialDeployment(player, muster);
  const cam = new Camera(800, 600);
  const selected = new Set<number>();
  let generalSelected = false;
  let finished = false;
  const abort = new AbortController();

  /* ---------- interaction state ---------- */

  type Drag =
    | { kind: "none" }
    | { kind: "box"; x0: number; y0: number; x1: number; y1: number }
    | { kind: "place"; downW: [number, number]; curW: [number, number]; dxScreen: number; shift: boolean }
    | { kind: "pan"; lastX: number; lastY: number };
  let drag: Drag = { kind: "none" };
  let ghosts: GhostUnit[] = [];
  let ghostTargets: Map<number, { x: number; y: number; angle: number }> = new Map();

  const finish = (): void => {
    if (finished) return;
    finished = true;
    timer.stop();
    abort.abort();
    onDone(state);
  };

  const timer = createTimer(DEPLOY_SECONDS, () => {
    alalai();
    finish();
  });

  /* ---------- DOM ---------- */

  const canvas = el("canvas", { class: "field-canvas" }) as HTMLCanvasElement;
  const alalaiBtn = el("button", { class: "btn-marble" }, "Alalai!");
  alalaiBtn.addEventListener("click", () => {
    alalai();
    window.setTimeout(finish, 350);
  });

  const header = el(
    "div",
    { class: "select-header deploy-header" },
    el(
      "div",
      {},
      el("div", { class: "player-title" }, `Player ${player + 1} — Deploy your army`),
      el(
        "div",
        { class: "player-sub" },
        "left-click select · shift add · right-drag place & rotate · wheel zoom · Q/E turn map",
      ),
    ),
    el("div", { class: "deploy-header-right" }, timer.element, alalaiBtn),
  );

  const root = el("div", { class: "screen deploy-screen" });
  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);
  root.append(top, el("div", { class: "screen-body deploy-body" }, header, canvas), bottom);

  /* ---------- helpers ---------- */

  const myUnits = (): FieldUnit[] => state.units;
  const selectedUnits = (): FieldUnit[] => state.units.filter((u) => selected.has(u.uid));

  function unitAt(wx: number, wy: number): FieldUnit | null {
    for (let i = state.units.length - 1; i >= 0; i--) {
      const u = state.units[i]!;
      if (containsPoint(u, wx, wy)) return u;
    }
    return null;
  }

  function generalAt(wx: number, wy: number): boolean {
    return Math.hypot(wx - state.general.x, wy - state.general.y) <= GENERAL_RADIUS + 30;
  }

  function rotateAround(
    u: { x: number; y: number; angle: number },
    px: number,
    py: number,
    delta: number,
  ): { x: number; y: number; angle: number } {
    const c = Math.cos(delta);
    const s = Math.sin(delta);
    const dx = u.x - px;
    const dy = u.y - py;
    return { x: px + dx * c - dy * s, y: py + dx * s + dy * c, angle: u.angle + delta };
  }

  /** Compute placement ghosts for the current drag. */
  function updateGhosts(): void {
    ghosts = [];
    ghostTargets = new Map();
    if (drag.kind !== "place") return;
    const sel = selectedUnits();
    if (sel.length === 0) return;
    const [dwx, dwy] = drag.downW;
    const [cwx, cwy] = drag.curW;
    const enemyDir: [number, number] = player === 0 ? [0, -1] : [0, 1];

    if (sel.length === 1) {
      // §3.5 single unit: place at the point; horizontal drag pivots
      // around TL (drag right) or TR (drag left)
      const u = sel[0]!;
      let target = { x: dwx, y: dwy, angle: u.angle };
      const delta = drag.dxScreen * 0.006;
      if (Math.abs(delta) > 0.01) {
        const c = corners({ ...target });
        const pivot = delta > 0 ? c.tl : c.tr;
        target = rotateAround(target, pivot[0], pivot[1], delta);
      }
      ghostTargets.set(u.uid, target);
    } else if (drag.shift) {
      // formation preserved: translate the group so its centroid lands
      // on the anchor, rotating toward the drag direction
      const cx = sel.reduce((s, u) => s + u.x, 0) / sel.length;
      const cy = sel.reduce((s, u) => s + u.y, 0) / sel.length;
      const vx = cwx - dwx;
      const vy = cwy - dwy;
      const groupAngle = Math.atan2(
        sel.reduce((s, u) => s + Math.sin(u.angle), 0),
        sel.reduce((s, u) => s + Math.cos(u.angle), 0),
      );
      const rot =
        Math.hypot(vx, vy) > 150 ? Math.atan2(vx, -vy) - groupAngle : 0;
      for (const u of sel) {
        const moved = { x: u.x + dwx - cx, y: u.y + dwy - cy, angle: u.angle };
        ghostTargets.set(u.uid, rotateAround(moved, dwx, dwy, rot));
      }
    } else {
      // §3.5 line deployment fanning from the anchor along the drag
      let vx = cwx - dwx;
      let vy = cwy - dwy;
      if (Math.hypot(vx, vy) < 150) {
        vx = player === 0 ? 1 : -1;
        vy = 0;
      }
      const len = Math.hypot(vx, vy);
      const ux = vx / len;
      const uy = vy / len;
      // face the perpendicular that points toward the enemy
      let px = -uy;
      let py = ux;
      if (px * enemyDir[0] + py * enemyDir[1] < 0) {
        px = -px;
        py = -py;
      }
      const angle = Math.atan2(px, -py);
      const slots = sel.map((_, i) => ({
        x: dwx + ux * (100 + i * 220),
        y: dwy + uy * (100 + i * 220),
        angle,
      }));
      // §3.5: units take slots by proximity
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
        const u = remaining.splice(bestIdx, 1)[0]!;
        ghostTargets.set(u.uid, slot);
      }
    }

    const moved: FieldUnit[] = sel.map((u) => ({ ...u, ...ghostTargets.get(u.uid)! }));
    const valid = placementOk(def, state, moved);
    ghosts = moved.map((m) => ({ x: m.x, y: m.y, angle: m.angle, valid }));
  }

  function commitGhosts(): void {
    if (ghostTargets.size === 0) return;
    const sel = selectedUnits();
    const moved: FieldUnit[] = sel.map((u) => ({ ...u, ...ghostTargets.get(u.uid)! }));
    if (placementOk(def, state, moved)) {
      for (const m of moved) {
        const u = state.units.find((x) => x.uid === m.uid)!;
        u.x = m.x;
        u.y = m.y;
        u.angle = m.angle;
      }
      uiClick();
    } else {
      dismissThud();
    }
    ghosts = [];
    ghostTargets = new Map();
  }

  /* ---------- input ---------- */

  const sig = { signal: abort.signal };

  canvas.addEventListener("contextmenu", (e) => e.preventDefault(), sig);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      cam.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.pow(1.15, -e.deltaY / 100));
    },
    { passive: false, signal: abort.signal },
  );

  canvas.addEventListener(
    "mousedown",
    (e) => {
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const [wx, wy] = cam.toWorld(sx, sy);

      if (e.button === 1) {
        e.preventDefault();
        drag = { kind: "pan", lastX: sx, lastY: sy };
        return;
      }
      if (e.button === 0) {
        const u = unitAt(wx, wy);
        if (u) {
          if (!e.shiftKey) selected.clear();
          if (e.shiftKey && selected.has(u.uid)) selected.delete(u.uid);
          else selected.add(u.uid);
          generalSelected = false;
          uiClick();
        } else if (generalAt(wx, wy)) {
          selected.clear();
          generalSelected = true;
          uiClick();
        } else if (!e.shiftKey) {
          selected.clear();
          generalSelected = false;
        }
        return;
      }
      if (e.button === 2) {
        if (generalSelected) {
          // move the general's star (§3.4): valid inside his strip/camp
          if (generalZoneOk(player, wx, wy)) {
            state.general.x = wx;
            state.general.y = wy;
            uiClick();
          } else {
            dismissThud();
          }
          return;
        }
        if (selected.size > 0) {
          drag = { kind: "place", downW: [wx, wy], curW: [wx, wy], dxScreen: 0, shift: e.shiftKey };
          updateGhosts();
        } else {
          // §3.5: right-drag opens a selection box
          drag = { kind: "box", x0: sx, y0: sy, x1: sx, y1: sy };
        }
      }
    },
    sig,
  );

  window.addEventListener(
    "mousemove",
    (e) => {
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      if (drag.kind === "pan") {
        cam.panScreen(sx - drag.lastX, sy - drag.lastY);
        drag.lastX = sx;
        drag.lastY = sy;
      } else if (drag.kind === "box") {
        drag.x1 = sx;
        drag.y1 = sy;
      } else if (drag.kind === "place") {
        const [wx, wy] = cam.toWorld(sx, sy);
        drag.curW = [wx, wy];
        drag.dxScreen = sx - (cam.toScreen(...drag.downW)[0] ?? sx);
        drag.shift = e.shiftKey;
        updateGhosts();
      }
    },
    sig,
  );

  window.addEventListener(
    "mouseup",
    (e) => {
      if (drag.kind === "box" && e.button === 2) {
        const bx0 = Math.min(drag.x0, drag.x1);
        const bx1 = Math.max(drag.x0, drag.x1);
        const by0 = Math.min(drag.y0, drag.y1);
        const by1 = Math.max(drag.y0, drag.y1);
        if (bx1 - bx0 > 6 || by1 - by0 > 6) {
          selected.clear();
          generalSelected = false;
          for (const u of myUnits()) {
            const cs = corners(u);
            const allIn = [cs.tl, cs.tr, cs.bl, cs.br].every(([px, py]) => {
              const [sx, sy] = cam.toScreen(px, py);
              return sx >= bx0 && sx <= bx1 && sy >= by0 && sy <= by1;
            });
            if (allIn) selected.add(u.uid);
          }
          if (selected.size > 0) uiClick();
        }
        drag = { kind: "none" };
      } else if (drag.kind === "place" && e.button === 2) {
        commitGhosts();
        drag = { kind: "none" };
      } else if (drag.kind === "pan" && e.button === 1) {
        drag = { kind: "none" };
      }
    },
    sig,
  );

  window.addEventListener(
    "keydown",
    (e) => {
      const pan = 60;
      switch (e.key) {
        case "q":
        case "Q":
          cam.rotate(-Math.PI / 24);
          break;
        case "e":
        case "E":
          cam.rotate(Math.PI / 24);
          break;
        case "r":
        case "R":
          cam.reset();
          break;
        case "ArrowUp":
          cam.panScreen(0, pan);
          break;
        case "ArrowDown":
          cam.panScreen(0, -pan);
          break;
        case "ArrowLeft":
          cam.panScreen(pan, 0);
          break;
        case "ArrowRight":
          cam.panScreen(-pan, 0);
          break;
        case "Escape":
          selected.clear();
          generalSelected = false;
          break;
      }
    },
    sig,
  );

  /* ---------- render loop ---------- */

  const zones = [
    { zone: largeZone(player), player, emphasis: false },
    { zone: smallZone(player), player, emphasis: true },
  ];

  loadMapImage(def, () => undefined);

  function frame(): void {
    if (finished) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w > 0 && (canvas.width !== w * dpr || canvas.height !== h * dpr)) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const fit = cam.viewW === 800 && cam.viewH === 600;
      cam.resize(w, h);
      if (fit) cam.reset();
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, {
      def,
      cam,
      units: state.units,
      generals: [state.general],
      zones,
      selected,
      generalSelected,
      ghosts,
      selectBox: drag.kind === "box" ? drag : undefined,
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return root;
}
