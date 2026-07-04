import { clear, el, fromHTML } from "../dom";
import { applyMeander } from "../art/ornaments";
import { createTimer } from "../components/timer";
import { generalTooltipHTML, unitTooltipHTML } from "../components/tooltip";
import { unitArtSVG } from "../art/unitArt";
import { alalai, dismissThud, uiClick } from "../sound";
import { Camera } from "../field/camera";
import { drawScene, loadMapImage, type GhostUnit } from "../field/fieldRenderer";
import type { PlayerId } from "../../engine/types";
import { UNIT_DEFS } from "../../engine/data/units";
import { GENERAL_DEFS } from "../../engine/data/generals";
import type { BattlefieldDef } from "../../engine/battlefield";
import type { SelectionState } from "../../engine/recruitment";
import { DEPLOY_SECONDS } from "../../engine/recruitment";
import {
  generalZoneOk,
  initialDeployment,
  largeZone,
  placementReport,
  smallZone,
  type DeploymentState,
} from "../../engine/deployment";
import {
  containsPoint,
  GENERAL_RADIUS,
  corners,
  type FieldUnit,
} from "../../engine/field";

const UNIT_W = 200;
/** §4.1.1 formation continuity limit is 200 m; stretching stops 25 m short. */
const MAX_GAP = 175;
const MIN_GAP = 20;

/**
 * §3 — the deployment phase.
 * Camera: wheel zoom · right-drag on empty ground pans · Q/E rotate · R reset.
 * Selection: left-click (Shift adds) · left-drag boxes.
 * Placement: right-click moves; right-DRAG plants a pivot ("perno") at
 * the click point — the front line extends from that corner along the
 * drag, dragging right pivoting the TL corner, left the TR (§3.5).
 * Formations fan out along the same line, stretching their spacing up
 * to 175 m between units; Shift preserves the current formation.
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

  type Drag =
    | { kind: "none" }
    | { kind: "box"; x0: number; y0: number; x1: number; y1: number }
    | { kind: "place"; downW: [number, number]; downS: [number, number]; curW: [number, number]; curS: [number, number]; shift: boolean }
    | { kind: "pan"; lastX: number; lastY: number };
  let drag: Drag = { kind: "none" };
  let ghosts: GhostUnit[] = [];
  let ghostTargets: Map<number, { x: number; y: number; angle: number }> = new Map();

  const finish = (): void => {
    if (finished) return;
    finished = true;
    timer.stop();
    abort.abort();
    syncAttachedGeneral();
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

  const hint = el("div", { class: "player-sub deploy-hint" }, "");

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
        "left-click select · left-drag box · right-click place · right-drag pivot & line · right-drag on ground pans · wheel zoom · Q/E turn",
      ),
      hint,
    ),
    el("div", { class: "deploy-header-right" }, timer.element, alalaiBtn),
  );

  // info overlays: the general top-left, the selected unit bottom-left
  const generalPanel = el("div", { class: "tooltip field-panel field-panel-tl" });
  const g = GENERAL_DEFS[muster.general!];
  generalPanel.innerHTML = generalTooltipHTML(g);
  const unitPanelCard = el("div", { class: "unit-card field-unit-card" });
  const unitPanelInfo = el("div", { class: "tooltip field-panel" });
  const unitPanel = el(
    "div",
    { class: "field-panel-bl" },
    unitPanelCard,
    unitPanelInfo,
  );
  unitPanel.style.display = "none";

  const fieldWrap = el("div", { class: "field-wrap" }, canvas, generalPanel, unitPanel);

  const root = el("div", { class: "screen deploy-screen" });
  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);
  root.append(top, el("div", { class: "screen-body deploy-body" }, header, fieldWrap), bottom);

  function setHint(text: string): void {
    hint.textContent = text;
  }

  function updateInfoPanels(): void {
    const sel = selectedUnits();
    if (generalSelected) {
      unitPanel.style.display = "none";
      return;
    }
    if (sel.length === 0) {
      unitPanel.style.display = "none";
      return;
    }
    const first = UNIT_DEFS[sel[0]!.unit];
    const sameType = sel.every((u) => u.unit === first.id);
    unitPanel.style.display = "flex";
    clear(unitPanelCard);
    unitPanelCard.append(
      el("div", { class: "unit-card-name" }, first.name),
      el("div", { class: "unit-card-art" }, fromHTML(unitArtSVG(first))),
      el(
        "div",
        { class: "unit-card-foot" },
        el("span", {}, sel.length > 1 ? `×${sel.length} selected` : first.epithet.split("—")[1]?.trim() ?? ""),
      ),
    );
    unitPanelInfo.innerHTML = sameType
      ? unitTooltipHTML(first)
      : `<h4>${sel.length} units</h4><div class="tt-role">A mixed body: ${[...new Set(sel.map((u) => UNIT_DEFS[u.unit].name))].join(", ")}.</div>`;
  }

  /* ---------- helpers ---------- */

  const selectedUnits = (): FieldUnit[] => state.units.filter((u) => selected.has(u.uid));

  function unitAt(wx: number, wy: number): FieldUnit | null {
    for (let i = state.units.length - 1; i >= 0; i--) {
      const u = state.units[i]!;
      if (containsPoint(u, wx, wy)) return u;
    }
    return null;
  }

  function generalScreenPos(): [number, number] {
    if (state.general.attachedTo !== null) {
      const host = state.units.find((u) => u.uid === state.general.attachedTo);
      if (host) return [host.x, host.y];
    }
    return [state.general.x, state.general.y];
  }

  function generalAt(wx: number, wy: number): boolean {
    const [gx, gy] = generalScreenPos();
    return Math.hypot(wx - gx, wy - gy) <= GENERAL_RADIUS + 30;
  }

  function syncAttachedGeneral(): void {
    if (state.general.attachedTo === null) return;
    const host = state.units.find((u) => u.uid === state.general.attachedTo);
    if (host) {
      state.general.x = host.x;
      state.general.y = host.y;
    }
  }

  /* ---------- perno placement (§3.5) ---------- */

  function updateGhosts(): void {
    ghosts = [];
    ghostTargets = new Map();
    if (drag.kind !== "place") return;
    const sel = selectedUnits();
    if (sel.length === 0) return;

    const [pwx, pwy] = drag.downW;
    const [cwx, cwy] = drag.curW;
    const dragLen = Math.hypot(cwx - pwx, cwy - pwy);
    const dragging = dragLen > 60;
    const enemyDir: [number, number] = player === 0 ? [0, -1] : [0, 1];

    if (!dragging) {
      // plain right-click: move, keeping each unit's facing
      if (sel.length === 1) {
        const u = sel[0]!;
        ghostTargets.set(u.uid, { x: pwx, y: pwy, angle: u.angle });
      } else {
        // group shift keeping relative positions
        const cx = sel.reduce((s, u) => s + u.x, 0) / sel.length;
        const cy = sel.reduce((s, u) => s + u.y, 0) / sel.length;
        for (const u of sel) {
          ghostTargets.set(u.uid, { x: u.x + pwx - cx, y: u.y + pwy - cy, angle: u.angle });
        }
      }
    } else {
      // the drag defines the front line from the pivot ("perno"): the
      // pivot is the first unit's front corner — TL when the line runs
      // to the right of it, TR when to the left (§3.5)
      const ex = (cwx - pwx) / dragLen;
      const ey = (cwy - pwy) / dragLen;
      // face the perpendicular pointing toward the enemy
      let fx = ey;
      let fy = -ex;
      if (fx * enemyDir[0] + fy * enemyDir[1] < -1e-9) {
        fx = -fx;
        fy = -fy;
      }
      const angle = Math.atan2(fx, -fy);

      if (drag.shift && sel.length > 1) {
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
          ghostTargets.set(u.uid, {
            x: pwx + ox * c - oy * s,
            y: pwy + ox * s + oy * c,
            angle: u.angle + rot,
          });
        }
      } else {
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
          const u = remaining.splice(bestIdx, 1)[0]!;
          ghostTargets.set(u.uid, slot);
        }
      }
    }

    const sel2 = selectedUnits();
    const moved: FieldUnit[] = sel2.map((u) => ({ ...u, ...ghostTargets.get(u.uid)! }));
    const report = placementReport(def, state, moved);
    ghosts = moved.map((m, i) => ({ x: m.x, y: m.y, angle: m.angle, valid: report[i] === true }));
  }

  function commitGhosts(): void {
    if (ghostTargets.size === 0) return;
    const sel = selectedUnits();
    const moved: FieldUnit[] = sel.map((u) => ({ ...u, ...ghostTargets.get(u.uid)! }));
    if (placementReport(def, state, moved).every(Boolean)) {
      for (const m of moved) {
        const u = state.units.find((x) => x.uid === m.uid)!;
        u.x = m.x;
        u.y = m.y;
        u.angle = m.angle;
      }
      syncAttachedGeneral();
      uiClick();
    } else {
      dismissThud();
      setHint("The line will not fit there — every unit must stand on lawful ground.");
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
          setHint(
            state.general.attachedTo === null
              ? `${g.name} follows your voice — right-click a unit to attach him, or ground to move him.`
              : `${g.name} rides with the ranks — right-click ground to detach him.`,
          );
        } else {
          // maybe a box select
          drag = { kind: "box", x0: sx, y0: sy, x1: sx, y1: sy };
        }
        updateInfoPanels();
        return;
      }

      if (e.button === 2) {
        if (generalSelected) {
          const host = unitAt(wx, wy);
          if (host) {
            // §3.4 — attach: he takes his place at the unit's centre
            state.general.attachedTo = host.uid;
            syncAttachedGeneral();
            uiClick();
            setHint(`${g.name} attaches to the ${UNIT_DEFS[host.unit].name}. He moves as they move.`);
          } else if (generalZoneOk(player, wx, wy)) {
            state.general.attachedTo = null;
            state.general.x = wx;
            state.general.y = wy;
            uiClick();
            setHint("");
          } else {
            dismissThud();
            setHint("The general must stay within the line of deployment or his camp.");
          }
          return;
        }
        if (selected.size > 0) {
          drag = {
            kind: "place",
            downW: [wx, wy],
            downS: [sx, sy],
            curW: [wx, wy],
            curS: [sx, sy],
            shift: e.shiftKey,
          };
          updateGhosts();
        } else {
          // right-drag on empty ground pans the map
          drag = { kind: "pan", lastX: sx, lastY: sy };
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
        drag.curW = cam.toWorld(sx, sy);
        drag.curS = [sx, sy];
        drag.shift = e.shiftKey;
        updateGhosts();
      }
    },
    sig,
  );

  window.addEventListener(
    "mouseup",
    (e) => {
      if (drag.kind === "box" && e.button === 0) {
        const bx0 = Math.min(drag.x0, drag.x1);
        const bx1 = Math.max(drag.x0, drag.x1);
        const by0 = Math.min(drag.y0, drag.y1);
        const by1 = Math.max(drag.y0, drag.y1);
        if (bx1 - bx0 > 6 || by1 - by0 > 6) {
          selected.clear();
          generalSelected = false;
          for (const u of state.units) {
            const cs = corners(u);
            const allIn = [cs.tl, cs.tr, cs.bl, cs.br].every(([px, py]) => {
              const [ssx, ssy] = cam.toScreen(px, py);
              return ssx >= bx0 && ssx <= bx1 && ssy >= by0 && ssy <= by1;
            });
            if (allIn) selected.add(u.uid);
          }
          if (selected.size > 0) uiClick();
        } else {
          selected.clear();
          generalSelected = false;
          setHint("");
        }
        updateInfoPanels();
        drag = { kind: "none" };
      } else if (drag.kind === "place" && e.button === 2) {
        commitGhosts();
        drag = { kind: "none" };
      } else if (drag.kind === "pan" && (e.button === 1 || e.button === 2)) {
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
          updateInfoPanels();
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
      const firstFit = cam.viewW === 800 && cam.viewH === 600;
      cam.resize(w, h);
      if (firstFit) cam.reset();
    }
    syncAttachedGeneral();
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
