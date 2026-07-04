import { clear, el, fromHTML } from "../dom";
import { applyMeander } from "../art/ornaments";
import { createTimer } from "../components/timer";
import { unitTooltipHTML } from "../components/tooltip";
import { unitArtSVG } from "../art/unitArt";
import { coinSVG } from "../art/coinArt";
import { alalai, dismissThud, uiClick } from "../sound";
import { Camera } from "../field/camera";
import { drawScene, loadMapImage, type GhostUnit } from "../field/fieldRenderer";
import type { PlayerId, UnitDef } from "../../engine/types";
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
 * Selection: left-click (Shift adds) · left-drag boxes · the general's
 * star always wins the click over the unit he rides with.
 * Placement: right-click moves; right-DRAG plants a pivot ("perno") —
 * the front line runs from that corner along the drag, and the line
 * faces the LEFT of the drag, so dragging the other way deploys units
 * facing rearward. Formations stretch their gaps up to 175 m; Shift
 * preserves the current formation.
 */
export function deployScreen(
  player: PlayerId,
  def: BattlefieldDef,
  muster: SelectionState,
  onDone: (state: DeploymentState) => void,
): HTMLElement {
  const state = initialDeployment(player, muster);
  const g = GENERAL_DEFS[muster.general!];
  const cam = new Camera(800, 600);
  const selected = new Set<number>();
  let generalSelected = false;
  let finished = false;
  const abort = new AbortController();

  type Drag =
    | { kind: "none" }
    | { kind: "box"; x0: number; y0: number; x1: number; y1: number }
    | { kind: "place"; downW: [number, number]; curW: [number, number]; shift: boolean }
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
  const setHint = (t: string): void => {
    hint.textContent = t;
  };

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
        "left-click select · left-drag box · right-click place · right-drag pivot & line (faces left of the drag) · right-drag ground pans · wheel zoom · Q/E turn",
      ),
      hint,
    ),
    el("div", { class: "deploy-header-right" }, timer.element, alalaiBtn),
  );

  /* general panel (top-left): portrait, name, and the four stats */
  const pips = (n: number): string => "●".repeat(n) + "○".repeat(Math.max(0, 3 - n));
  const generalPanel = el("div", { class: "field-general-panel" });
  generalPanel.innerHTML = `
    <div class="fgp-head">
      <div class="fgp-coin">${coinSVG(g, 62)}</div>
      <div>
        <div class="fgp-name">${g.name}</div>
        <div class="fgp-epithet">${g.epithet}</div>
      </div>
    </div>
    <div class="fgp-stats">
      <span class="lbl">Command</span><span class="val">${pips(g.command)}</span>
      <span class="lbl">Glance</span><span class="val">${pips(g.glance)}</span>
      <span class="lbl">Brilliancy</span><span class="val">${pips(g.brilliancy)}</span>
      <span class="lbl">Charisma</span><span class="val">${pips(g.charisma)}</span>
    </div>`;

  /* selection panel (bottom-left): card fan + fixed papyrus */
  const cardsRow = el("div", { class: "field-cards" });
  const infoPanel = el("div", { class: "tooltip field-panel" });
  const unitPanel = el("div", { class: "field-panel-bl" }, cardsRow, infoPanel);
  unitPanel.style.display = "none";

  /* attach/detach popup */
  const popup = el("div", { class: "papyrus-panel field-popup" });
  popup.style.display = "none";
  let pendingAttach: number | null = null;

  function hidePopup(): void {
    popup.style.display = "none";
    pendingAttach = null;
  }

  function showPopup(message: string, actions: [string, () => void][]): void {
    clear(popup);
    popup.append(el("p", { class: "field-popup-msg" }, message));
    const row = el("div", { class: "field-popup-actions" });
    for (const [label, fn] of actions) {
      const b = el("button", { class: "btn-plain" }, label);
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        fn();
      });
      row.append(b);
    }
    popup.append(row);
    popup.style.display = "block";
  }

  const fieldWrap = el("div", { class: "field-wrap" }, canvas, generalPanel, unitPanel, popup);

  const root = el("div", { class: "screen deploy-screen" });
  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);
  root.append(top, el("div", { class: "screen-body deploy-body" }, header, fieldWrap), bottom);

  /* ---------- info panels ---------- */

  function miniCard(def2: UnitDef, title: string, count: number, foot: string): HTMLElement {
    const card = el(
      "div",
      { class: "unit-card field-unit-card" },
      el("div", { class: "unit-card-name" }, title),
      el("div", { class: "unit-card-art" }, fromHTML(unitArtSVG(def2))),
      el(
        "div",
        { class: "unit-card-foot" },
        el("span", {}, foot),
        count > 1 ? el("span", { class: "unit-count-badge" }, `×${count}`) : el("span", {}, ""),
      ),
    );
    return card;
  }

  function generalUnitHTML(): string {
    const h = UNIT_DEFS.hetairoi;
    return `
      <h4>${g.name}</h4>
      <div class="tt-epithet">the general's own banda — fights as ${h.name}</div>
      <div class="tt-role">${g.role}</div>
      <div class="tt-stats">
        <div><b>Attack</b> ${h.attack} <span style="opacity:.75">+${h.charge} charge</span></div>
        <div><b>Defense</b> ${h.defense} <span style="opacity:.75">+${h.formation} formation</span></div>
        <div><b>Training</b> ${h.training}</div>
        <div><b>Speed</b> ${h.speed}</div>
        <div><b>Endurance</b> ${h.endurance}</div>
        <div><b>Morale</b> ${h.morale}</div>
      </div>
      <div class="tt-note">Can attach to a friendly unit and ride at its centre; his own unit
      stands down until he detaches (§3.4). Attached units roll with Advantage.</div>`;
  }

  function updateInfoPanels(): void {
    clear(cardsRow);
    const sel = selectedUnits();

    if (generalSelected) {
      unitPanel.style.display = "flex";
      cardsRow.append(miniCard(UNIT_DEFS.hetairoi, g.name, 1, "elite heavy cavalry"));
      infoPanel.innerHTML = generalUnitHTML();
      return;
    }
    if (sel.length === 0) {
      unitPanel.style.display = "none";
      return;
    }

    unitPanel.style.display = "flex";
    // group by type, one card per type, fanned; hover focuses the papyrus
    const groups = new Map<string, { def: UnitDef; count: number }>();
    for (const u of sel) {
      const d = UNIT_DEFS[u.unit];
      const e = groups.get(d.id) ?? { def: d, count: 0 };
      e.count++;
      groups.set(d.id, e);
    }
    const entries = [...groups.values()];
    const defaultHTML =
      entries.length === 1
        ? unitTooltipHTML(entries[0]!.def, undefined, { cost: false })
        : `<h4>${sel.length} units</h4>
           <div class="tt-role">A mixed body of ${entries.length} kinds. Hover a card for its profile.</div>
           ${entries.map((e) => `<div>${e.def.name} ×${e.count}</div>`).join("")}`;
    infoPanel.innerHTML = defaultHTML;

    entries.forEach((e, i) => {
      const card = miniCard(e.def, e.def.name, e.count, e.def.epithet.split("—")[1]?.trim() ?? "");
      if (entries.length > 1) {
        card.classList.add("is-fanned");
        card.style.zIndex = String(10 + i);
      }
      card.addEventListener("mouseenter", () => {
        infoPanel.innerHTML = unitTooltipHTML(e.def, undefined, { cost: false });
        card.classList.add("is-focus");
      });
      card.addEventListener("mouseleave", () => {
        infoPanel.innerHTML = defaultHTML;
        card.classList.remove("is-focus");
      });
      cardsRow.append(card);
    });
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

  function generalPos(): [number, number] {
    if (state.general.attachedTo !== null) {
      const host = state.units.find((u) => u.uid === state.general.attachedTo);
      if (host) return [host.x, host.y];
    }
    return [state.general.x, state.general.y];
  }

  /** The star's click wins over the unit beneath it. */
  function generalAt(wx: number, wy: number): boolean {
    const [gx, gy] = generalPos();
    const r = state.general.attachedTo !== null ? 55 : GENERAL_RADIUS + 30;
    return Math.hypot(wx - gx, wy - gy) <= r;
  }

  function syncAttachedGeneral(): void {
    if (state.general.attachedTo === null) return;
    const host = state.units.find((u) => u.uid === state.general.attachedTo);
    if (host) {
      state.general.x = host.x;
      state.general.y = host.y;
    }
  }

  function selectGeneral(): void {
    selected.clear();
    generalSelected = true;
    uiClick();
    if (state.general.attachedTo !== null) {
      const host = state.units.find((u) => u.uid === state.general.attachedTo);
      const hostName = host ? UNIT_DEFS[host.unit].name : "the ranks";
      showPopup(`${g.name} rides with the ${hostName}.`, [
        [
          "Detach him",
          () => {
            state.general.attachedTo = null;
            uiClick();
            hidePopup();
            setHint(`${g.name} takes his own station — right-click ground to move him.`);
          },
        ],
        ["Leave him", hidePopup],
      ]);
    } else {
      setHint(`${g.name} follows your voice — right-click a unit to attach him, or ground to move him.`);
    }
    updateInfoPanels();
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

    if (!dragging) {
      if (sel.length === 1) {
        const u = sel[0]!;
        ghostTargets.set(u.uid, { x: pwx, y: pwy, angle: u.angle });
      } else {
        const cx = sel.reduce((s, u) => s + u.x, 0) / sel.length;
        const cy = sel.reduce((s, u) => s + u.y, 0) / sel.length;
        for (const u of sel) {
          ghostTargets.set(u.uid, { x: u.x + pwx - cx, y: u.y + pwy - cy, angle: u.angle });
        }
      }
    } else {
      // the drag defines the front line from the pivot ("perno"); the
      // line faces the LEFT of the drag — drag the other way to face
      // rearward. No auto-facing correction.
      const ex = (cwx - pwx) / dragLen;
      const ey = (cwy - pwy) / dragLen;
      const fx = ey;
      const fy = -ex;
      const angle = Math.atan2(fx, -fy);

      if (drag.shift && sel.length > 1) {
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
        const n = sel.length;
        let gap = MIN_GAP;
        if (n > 1) {
          gap = Math.max(MIN_GAP, Math.min(MAX_GAP, (dragLen - n * UNIT_W) / (n - 1)));
        }
        const slots = sel.map((_, i) => {
          const along = 100 + i * (UNIT_W + gap);
          return { x: pwx + ex * along - fx * 50, y: pwy + ey * along - fy * 50, angle };
        });
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
        hidePopup();
        if (generalAt(wx, wy)) {
          selectGeneral();
          return;
        }
        const u = unitAt(wx, wy);
        if (u) {
          if (!e.shiftKey) selected.clear();
          if (e.shiftKey && selected.has(u.uid)) selected.delete(u.uid);
          else selected.add(u.uid);
          generalSelected = false;
          uiClick();
          updateInfoPanels();
        } else {
          drag = { kind: "box", x0: sx, y0: sy, x1: sx, y1: sy };
        }
        return;
      }

      if (e.button === 2) {
        if (generalSelected) {
          const host = unitAt(wx, wy);
          if (host) {
            pendingAttach = host.uid;
            showPopup(`Attach ${g.name} to the ${UNIT_DEFS[host.unit].name}?`, [
              [
                "Attach",
                () => {
                  state.general.attachedTo = pendingAttach;
                  syncAttachedGeneral();
                  uiClick();
                  hidePopup();
                  setHint(`${g.name} rides at their centre. Click his star to detach him.`);
                },
              ],
              ["Cancel", hidePopup],
            ]);
          } else if (state.general.attachedTo === null && generalZoneOk(player, wx, wy)) {
            state.general.x = wx;
            state.general.y = wy;
            uiClick();
            setHint("");
          } else if (state.general.attachedTo !== null) {
            dismissThud();
            setHint(`${g.name} rides with the ranks — click his star and detach him first.`);
          } else {
            dismissThud();
            setHint("The general must stay within the line of deployment or his camp.");
          }
          return;
        }
        if (selected.size > 0) {
          drag = { kind: "place", downW: [wx, wy], curW: [wx, wy], shift: e.shiftKey };
          updateGhosts();
        } else {
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
          hidePopup();
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
