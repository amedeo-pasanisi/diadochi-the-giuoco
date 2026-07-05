import { clear, el, fromHTML } from "../dom";
import { applyMeander } from "../art/ornaments";
import { createTimer, type PhaseTimer } from "../components/timer";
import { attachTooltip, unitTooltipHTML } from "../components/tooltip";
import { unitArtSVG } from "../art/unitArt";
import { coinSVG } from "../art/coinArt";
import { alalai, dismissThud, marchHorn, uiClick } from "../sound";
import { Camera } from "../field/camera";
import { drawScene, loadMapImage, type GhostUnit, type SceneLine } from "../field/fieldRenderer";
import { glanceRingLines, pernoTargets, type PernoTarget } from "../field/formation";
import type { PlayerId, UnitDef } from "../../engine/types";
import { UNIT_DEFS } from "../../engine/data/units";
import { GENERAL_DEFS } from "../../engine/data/generals";
import type { Rng } from "../../engine/rng";
import { containsPoint, type FieldUnit } from "../../engine/field";
import {
  COMMAND_SECONDS,
  GLANCE_SECONDS,
  commandPool,
  glancePool,
  orderCost,
  type Order,
} from "../../engine/battle/orders";
import {
  attachGeneralTo,
  detachGeneralFrom,
  generalOf,
  generalPosition,
  liveUnits,
  speedBudgetM,
  unitByUid,
  victoryBar,
  withinGlance,
  type BattleState,
  type BattleUnit,
} from "../../engine/battle/state";
import { finishBattle, resolveBattlePhase, type Keyframes } from "../../engine/battle/resolve";

const PLAYBACK_MS = 3800;

type PhaseKind = "command" | "glance";

interface OrderBatch {
  uids: number[];
  cost: number;
}

/**
 * §4.1–§4.2 — the battle screen. Hotseat: Command P1 → Command P2 →
 * Glance P1 → Glance P2 → the Battle Phase plays out before both.
 */
export function battleScreen(
  state: BattleState,
  rng: Rng,
  onDone: (s: BattleState) => void,
): HTMLElement {
  const cam = new Camera(800, 600);
  const selected = new Set<number>();
  let actor: PlayerId = 0;
  let phase: PhaseKind = "command";
  let mode: "curtain" | "orders" | "playback" | "events" = "curtain";
  let budgetTotal = 0;
  let budgetSpent = 0;
  let hornBlown = false;
  const brilliancyLeft: [number, number] = [
    GENERAL_DEFS[state.musters[0].general!].brilliancy,
    GENERAL_DEFS[state.musters[1].general!].brilliancy,
  ];
  let batches: OrderBatch[] = [];
  let timer: PhaseTimer | null = null;
  let playback: { frames: Keyframes; start: number } | null = null;
  let finished = false;
  const abort = new AbortController();

  /* ---------- DOM scaffolding ---------- */

  const canvas = el("canvas", { class: "field-canvas" }) as HTMLCanvasElement;
  const hint = el("div", { class: "player-sub deploy-hint" }, "");
  const setHint = (t: string): void => {
    hint.textContent = t;
  };

  const phaseTitle = el("div", { class: "player-title" }, "");
  const phaseSub = el(
    "div",
    { class: "player-sub" },
    "right-click ground march · right-click enemy attack · F face · S skirmish · A avoid · W wait · dbl-click fast · shift formation/secondary · ctrl+Z recall",
  );

  const ordersPill = el("div", { class: "hud-pill" });
  const timerSlot = el("span", {});

  // the victory bar is an actual bar: white (P1) against black (P2)
  const barFill = el("div", { class: "vbar-fill" });
  const barBox = el(
    "div",
    { class: "hud-pill vbar-box" },
    el("span", { class: "pill-label" }, "Bar"),
    el("div", { class: "vbar-track" }, barFill, el("div", { class: "vbar-tick" })),
  );

  // Brilliancy and its horn live in one box — the horn SPENDS brilliancy
  const hornBtn = el("button", { class: "btn-plain horn-btn" }, "Blow Horn +3") as HTMLButtonElement;
  const brillDots = el("span", { class: "brill-dots" }, "");
  const brillGroup = el(
    "div",
    { class: "hud-pill brill-group" },
    el("span", { class: "pill-label" }, "Brilliancy"),
    brillDots,
    hornBtn,
  );

  const recallBtn = el("button", { class: "btn-plain" }, "Recall Orders") as HTMLButtonElement;
  const retreatBtn = el("button", { class: "btn-plain" }, "Sound Retreat") as HTMLButtonElement;
  const doneBtn = el("button", { class: "btn-marble" }, "Send Messengers") as HTMLButtonElement;

  const header = el(
    "div",
    { class: "select-header deploy-header" },
    el("div", {}, phaseTitle, phaseSub, hint),
    el(
      "div",
      { class: "deploy-header-right battle-hud" },
      barBox,
      ordersPill,
      brillGroup,
      timerSlot,
      recallBtn,
      retreatBtn,
      doneBtn,
    ),
  );

  /* brief papyrus explanations on hover */
  attachTooltip(barBox, () => `<h4>The victory bar</h4><div class="tt-role">The weight of surviving strength, white against black. At ±100% the battle ends; a losing bar saps your army's morale.</div>`);
  attachTooltip(ordersPill, () => `<h4>Orders</h4><div class="tt-role">3 + your general's Command each Command Phase; his Glance stat in the Glance Phase. A formation move costs one order per connected group (within 200 m).</div>`);
  attachTooltip(brillGroup, () => `<h4>Brilliancy</h4><div class="tt-role">Blow the horn to spend one point of Brilliancy for +3 orders this phase. Spent points never return — genius is a finite resource.</div>`);
  attachTooltip(recallBtn, () => `<h4>Recall orders</h4><div class="tt-role">Cancel the selected units' orders and refund what they cost. Ctrl+Z undoes the last order given.</div>`);
  attachTooltip(retreatBtn, () => `<h4>Sound retreat</h4><div class="tt-role">Concede the field. The battle ends at once — your rival takes the victory.</div>`);
  attachTooltip(doneBtn, () => `<h4>${phase === "command" ? "Send messengers" : "Shout orders"}</h4><div class="tt-role">Seal your orders and pass the turn on. Unspent orders are lost.</div>`);

  /* info panels (same pattern as deployment) */
  const generalPanel = el("div", { class: "field-general-panel" });
  const cardsRow = el("div", { class: "field-cards" });
  const infoPanel = el("div", { class: "tooltip field-panel" });
  const unitPanel = el("div", { class: "field-panel-bl" }, cardsRow, infoPanel);
  unitPanel.style.display = "none";

  const popup = el("div", { class: "papyrus-panel field-popup" });
  popup.style.display = "none";

  const curtain = el("div", { class: "battle-curtain" });

  const fieldWrap = el(
    "div",
    { class: "field-wrap" },
    canvas,
    generalPanel,
    unitPanel,
    popup,
    curtain,
  );

  const root = el("div", { class: "screen" });
  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);
  root.append(top, el("div", { class: "screen-body deploy-body" }, header, fieldWrap), bottom);

  /* ---------- helpers ---------- */

  const myUnits = (): BattleUnit[] => liveUnits(state, actor);
  const enemyUnits = (): BattleUnit[] => liveUnits(state, (1 - actor) as PlayerId);
  const selectedUnits = (): BattleUnit[] => myUnits().filter((u) => selected.has(u.uid));

  function orderable(u: BattleUnit): boolean {
    // §4.2.3 — no orders for routing or pursuing units
    if (u.status !== "normal") return false;
    if (phase === "glance" && !withinGlance(state, u)) return false;
    return true;
  }

  function remaining(): number {
    return budgetTotal - budgetSpent;
  }

  function refreshHud(): void {
    const g = GENERAL_DEFS[state.musters[actor].general!];
    phaseTitle.textContent = `Turn ${state.turn} · ${phase === "command" ? "Command" : "Glance"} Phase — Player ${actor + 1} (${g.name})`;
    ordersPill.innerHTML = `<span class="pill-label">Orders</span>${remaining()} / ${budgetTotal}`;
    brillDots.textContent = "●".repeat(brilliancyLeft[actor]) + "○".repeat(Math.max(0, 3 - brilliancyLeft[actor]));
    const bar = victoryBar(state); // positive favours P1 (white)
    barFill.style.width = `${Math.max(0, Math.min(100, 50 + bar / 2))}%`;
    hornBtn.disabled = hornBlown || brilliancyLeft[actor] <= 0;
    doneBtn.textContent = phase === "command" ? "Send Messengers" : "Shout Orders";
  }

  function renderGeneralPanel(): void {
    const gid = state.musters[actor].general!;
    const g = GENERAL_DEFS[gid];
    const bg = generalOf(state, actor);
    const pips = (n: number): string => "●".repeat(n) + "○".repeat(Math.max(0, 3 - n));
    const cond =
      bg.condition === "dead"
        ? '<span style="color:#d24a2e">fallen</span>'
        : bg.condition === "fled"
          ? '<span style="color:#d24a2e">fled — halved</span>'
          : bg.rallying
            ? '<span style="color:#e0b25e">rallying the broken</span>'
            : "in the field";
    generalPanel.innerHTML = `
      <div class="fgp-head">
        <div class="fgp-coin">${coinSVG(g, 62)}</div>
        <div>
          <div class="fgp-name">${g.name}</div>
          <div class="fgp-epithet">${cond}</div>
        </div>
      </div>
      <div class="fgp-stats">
        <span class="lbl">Command</span><span class="val">${pips(g.command)}</span>
        <span class="lbl">Glance</span><span class="val">${pips(g.glance)}</span>
        <span class="lbl">Brilliancy</span><span class="val">${pips(brilliancyLeft[actor])}</span>
        <span class="lbl">Charisma</span><span class="val">${pips(g.charisma)}</span>
      </div>`;
  }

  function miniCard(def2: UnitDef, title: string, count: number, foot: string): HTMLElement {
    return el(
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
  }

  function updateInfoPanels(): void {
    clear(cardsRow);
    const sel = selectedUnits();
    if (sel.length === 0) {
      unitPanel.style.display = "none";
      return;
    }
    unitPanel.style.display = "flex";
    // the general's escort gets his own card, under his own name
    if (sel.some((u) => u.uid >= 9000)) {
      const g = GENERAL_DEFS[state.musters[actor].general!];
      const h = UNIT_DEFS.hetairoi;
      cardsRow.append(miniCard(h, g.name, 1, "elite heavy cavalry"));
      infoPanel.innerHTML = `
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
        <div class="tt-note">Right-click a friendly unit within 400 m to attach him; attached units
        roll with Advantage. If his unit breaks, he flees or dies (§4.4).</div>`;
      return;
    }
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
        : `<h4>${sel.length} units</h4><div class="tt-role">A mixed body of ${entries.length} kinds.</div>` +
          entries.map((e) => `<div>${e.def.name} ×${e.count}</div>`).join("");
    infoPanel.innerHTML = defaultHTML;
    entries.forEach((e, i) => {
      const card = miniCard(e.def, e.def.name, e.count, e.def.epithet.split("—")[1]?.trim() ?? "");
      if (entries.length > 1) {
        card.classList.add("is-fanned");
        card.style.zIndex = String(10 + i);
      }
      card.addEventListener("mouseenter", () => {
        infoPanel.innerHTML = unitTooltipHTML(e.def, undefined, { cost: false });
      });
      card.addEventListener("mouseleave", () => {
        infoPanel.innerHTML = defaultHTML;
      });
      cardsRow.append(card);
    });
  }

  function showPopup(message: string, actions: [string, () => void][], extra?: HTMLElement): void {
    clear(popup);
    popup.append(el("p", { class: "field-popup-msg" }, message));
    if (extra) popup.append(extra);
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

  function hidePopup(): void {
    popup.style.display = "none";
  }

  /* ---------- phase flow ---------- */

  function startPhase(p: PhaseKind, a: PlayerId): void {
    phase = p;
    actor = a;
    selected.clear();
    generalSelected = false;
    ghostTargets = new Map();
    batches = [];
    hornBlown = false;
    const gid = state.musters[a].general!;
    const g = generalOf(state, a);
    const dead = g.condition === "dead";
    const mult = g.condition === "fled" ? 0.5 : 1;
    budgetTotal = dead
      ? 0
      : Math.floor((p === "command" ? commandPool(gid) : glancePool(gid)) * mult);
    budgetSpent = 0;
    doneBtn.textContent = p === "command" ? "Send Messengers" : "Shout Orders";
    showCurtain(
      `Player ${a + 1} — ${p === "command" ? "Command" : "Glance"} Phase`,
      p === "command"
        ? "Messengers wait by your tent. Your rival must look away."
        : "A last look across the field before the lines meet.",
      () => {
        mode = "orders";
        timer?.stop();
        timer = createTimer(p === "command" ? COMMAND_SECONDS : GLANCE_SECONDS, () => endPhase());
        clear(timerSlot);
        timerSlot.append(timer.element);
        refreshHud();
        renderGeneralPanel();
        updateInfoPanels();
      },
    );
  }

  function endPhase(): void {
    hidePopup();
    selected.clear();
    updateInfoPanels();
    uiClick();
    if (phase === "command" && actor === 0) startPhase("command", 1);
    else if (phase === "command") startPhase("glance", 0);
    else if (actor === 0) startPhase("glance", 1);
    else runBattlePhase();
  }

  function runBattlePhase(): void {
    mode = "playback";
    timer?.stop();
    showCurtain("The Battle Phase", "Both commanders may watch the lines move.", () => {
      marchHorn();
      const frames = resolveBattlePhase(state, rng);
      playback = { frames, start: performance.now() };
      window.setTimeout(() => {
        playback = null;
        showEvents();
      }, PLAYBACK_MS + 250);
    });
  }

  function showEvents(): void {
    mode = "events";
    const worthy = state.events.filter((e) => e.kind !== "info" || state.events.length < 6);
    const list = el("div", { class: "battle-events" });
    if (worthy.length === 0) {
      list.append(el("p", {}, "The lines shift and dust rises, but no blood is spilled yet."));
    }
    for (const e of worthy) {
      const cls = e.kind === "ptolemy" || e.kind === "victory" ? "ev-major" : "";
      list.append(el("p", { class: cls }, e.text));
    }
    showPopup(`Turn ${state.turn - 1} — the field speaks`, [
      [
        "Continue",
        () => {
          hidePopup();
          for (const g of state.generals) g.rallying = false;
          if (state.finished) {
            finished = true;
            abort.abort();
            timer?.stop();
            onDone(state);
          } else {
            startPhase("command", 0);
          }
        },
      ],
    ], list);
  }

  function showCurtain(title: string, sub: string, onReady: () => void): void {
    mode = "curtain";
    clear(curtain);
    const btn = el("button", { class: "btn-marble" }, "Ready");
    btn.addEventListener("click", () => {
      curtain.style.display = "none";
      onReady();
    });
    curtain.append(
      el("div", { class: "handoff-name", style: "font-size:30px" }, title),
      el("div", { class: "subtitle-line" }, sub),
      btn,
    );
    curtain.style.display = "flex";
  }

  /* ---------- issuing orders ---------- */

  function issueOrders(units: BattleUnit[], make: (u: BattleUnit) => Order | null): void {
    const eligible = units.filter(orderable);
    if (eligible.length === 0) {
      dismissThud();
      setHint(
        phase === "glance"
          ? "Glance orders reach only units within 500 m of the general."
          : "Those men are beyond orders now.",
      );
      return;
    }
    const cost = orderCost(eligible);
    if (cost > remaining()) {
      dismissThud();
      setHint(`That would take ${cost} order${cost > 1 ? "s" : ""} — only ${remaining()} left.`);
      return;
    }
    for (const u of eligible) {
      const o = make(u);
      if (o) u.order = o;
    }
    batches.push({ uids: eligible.map((u) => u.uid), cost });
    budgetSpent += cost;
    uiClick();
    refreshHud();
  }

  function recallSelected(): void {
    const sel = selectedUnits();
    const affected = batches.filter((b) => b.uids.some((uid) => sel.some((u) => u.uid === uid)));
    if (affected.length === 0 && batches.length > 0) return;
    for (const b of affected) {
      for (const uid of b.uids) {
        const u = state.units.find((x) => x.uid === uid);
        if (u) u.order = null;
      }
      budgetSpent -= b.cost;
    }
    batches = batches.filter((b) => !affected.includes(b));
    uiClick();
    refreshHud();
  }

  function undoLastBatch(): void {
    const b = batches.pop();
    if (!b) return;
    for (const uid of b.uids) {
      const u = state.units.find((x) => x.uid === uid);
      if (u) u.order = null;
    }
    budgetSpent -= b.cost;
    uiClick();
    refreshHud();
  }

  /* ---------- input ---------- */

  type Drag =
    | { kind: "none" }
    | { kind: "box"; x0: number; y0: number; x1: number; y1: number; button: number }
    | { kind: "place"; downW: [number, number]; curW: [number, number]; shift: boolean }
    | { kind: "pan"; lastX: number; lastY: number };
  let drag: Drag = { kind: "none" };
  let lastRight = { t: 0, x: 0, y: 0 };
  let ghostTargets = new Map<number, PernoTarget>();
  let generalSelected = false;

  const generalName = (): string => GENERAL_DEFS[state.musters[actor].general!].name;

  /** §4.1.2 — a quick second right-click sets the last order to fast pace. */
  function upgradeLastFast(): void {
    const b = batches[batches.length - 1];
    if (!b) return;
    let changed = false;
    for (const uid of b.uids) {
      const u = unitByUid(state, uid);
      if (u?.order && (u.order.type === "march" || u.order.type === "attack") && !u.order.fast) {
        u.order.fast = true;
        changed = true;
      }
    }
    if (changed) {
      marchHorn();
      setHint("Fast pace! They will arrive sooner — and wearier.");
    }
  }

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

  const keysDown = new Set<string>();
  window.addEventListener("keydown", (e) => keysDown.add(e.key.toLowerCase()), sig);
  window.addEventListener("keyup", (e) => keysDown.delete(e.key.toLowerCase()), sig);

  canvas.addEventListener(
    "mousedown",
    (e) => {
      if (mode !== "orders") return;
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
        // the general's star wins the click, as in deployment
        const g = generalOf(state, actor);
        const [ggx, ggy] = generalPosition(state, g);
        if (g.condition === "fighting" && Math.hypot(wx - ggx, wy - ggy) <= 70) {
          selected.clear();
          generalSelected = true;
          if (g.attachedTo !== null) {
            const host = unitByUid(state, g.attachedTo);
            showPopup(
              `${generalName()} rides with the ${host ? UNIT_DEFS[host.unit].name : "ranks"}.`,
              [
                [
                  "Detach him",
                  () => {
                    detachGeneralFrom(state, actor);
                    generalSelected = true;
                    selected.clear();
                    selected.add(9000 + actor);
                    hidePopup();
                    uiClick();
                    setHint(`${generalName()} takes his own station.`);
                    updateInfoPanels();
                  },
                ],
                ["Leave him", hidePopup],
              ],
            );
          } else {
            selected.add(g.unitUid);
            setHint(
              `${generalName()} awaits — right-click ground to ride, right-click a unit to attach.`,
            );
          }
          uiClick();
          updateInfoPanels();
          return;
        }
        generalSelected = false;
        const u = unitAtPoint(
          myUnits().filter((x) => x.uid < 9000),
          wx,
          wy,
        );
        if (u) {
          if (!e.shiftKey) selected.clear();
          if (e.shiftKey && selected.has(u.uid)) selected.delete(u.uid);
          else selected.add(u.uid);
          uiClick();
          updateInfoPanels();
        } else {
          drag = { kind: "box", x0: sx, y0: sy, x1: sx, y1: sy, button: 0 };
        }
        return;
      }
      if (e.button === 2) {
        const now = performance.now();
        const dbl = now - lastRight.t < 400 && Math.hypot(sx - lastRight.x, sy - lastRight.y) < 24;
        lastRight = { t: now, x: sx, y: sy };
        if (dbl) {
          upgradeLastFast(); // §4.1.2 — double right-click = fast pace
          return;
        }

        const sel = selectedUnits();
        const enemy = unitAtPoint(enemyUnits(), wx, wy);

        // attach flow: general selected, right-click on a friendly unit
        if (generalSelected && !enemy) {
          const friendly = unitAtPoint(
            myUnits().filter((x) => x.uid < 9000),
            wx,
            wy,
          );
          if (friendly) {
            const g = generalOf(state, actor);
            const esc = g.unitUid >= 0 ? unitByUid(state, g.unitUid) : undefined;
            if (esc && !esc.removed && Math.hypot(esc.x - friendly.x, esc.y - friendly.y) <= 400) {
              showPopup(`Attach ${generalName()} to the ${UNIT_DEFS[friendly.unit].name}?`, [
                [
                  "Attach",
                  () => {
                    attachGeneralTo(state, actor, friendly.uid);
                    selected.clear();
                    generalSelected = false;
                    hidePopup();
                    uiClick();
                    setHint(`${generalName()} rides at their centre. Click his star to detach.`);
                    updateInfoPanels();
                  },
                ],
                ["Cancel", hidePopup],
              ]);
            } else {
              dismissThud();
              setHint(`${generalName()} must ride within 400 m before attaching — move him closer first.`);
            }
            return;
          }
        }

        if (sel.length === 0) {
          drag = { kind: "pan", lastX: sx, lastY: sy };
          return;
        }
        if (enemy) {
          if (keysDown.has("f")) {
            issueOrders(sel, () => ({ type: "face", targets: [enemy.uid] }));
          } else if (keysDown.has("s")) {
            issueOrders(sel, () => ({ type: "skirmish", targets: [enemy.uid] }));
          } else if (keysDown.has("a")) {
            issueOrders(sel, () => ({ type: "avoid", targets: [enemy.uid] }));
          } else {
            issueOrders(sel, () => ({
              type: "attack",
              targets: [enemy.uid],
              fast: false,
              secondary: e.shiftKey,
            }));
          }
          return;
        }
        // march to ground: the same perno drag as deployment (§4.1.1)
        drag = { kind: "place", downW: [wx, wy], curW: [wx, wy], shift: e.shiftKey };
        ghostTargets = pernoTargets(sel, drag.downW, drag.curW, drag.shift);
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
        ghostTargets = pernoTargets(selectedUnits(), drag.downW, drag.curW, drag.shift);
      }
    },
    sig,
  );

  window.addEventListener(
    "mouseup",
    (e) => {
      if (drag.kind === "place" && e.button === 2) {
        const targets = ghostTargets;
        ghostTargets = new Map();
        drag = { kind: "none" };
        if (targets.size > 0) {
          issueOrders(selectedUnits(), (u) => {
            const t = targets.get(u.uid);
            return t ? { type: "march", dest: t, fast: false } : null;
          });
        }
        return;
      }
      if (drag.kind !== "box") {
        if (drag.kind === "pan" && (e.button === 1 || e.button === 2)) drag = { kind: "none" };
        return;
      }
      const b = drag;
      drag = { kind: "none" };
      const bx0 = Math.min(b.x0, b.x1);
      const bx1 = Math.max(b.x0, b.x1);
      const by0 = Math.min(b.y0, b.y1);
      const by1 = Math.max(b.y0, b.y1);
      if (bx1 - bx0 < 6 && by1 - by0 < 6) {
        selected.clear();
        updateInfoPanels();
        return;
      }
      const inBox = (u: BattleUnit): boolean => {
        const [ssx, ssy] = cam.toScreen(u.x, u.y);
        return ssx >= bx0 && ssx <= bx1 && ssy >= by0 && ssy <= by1;
      };
      selected.clear();
      generalSelected = false;
      for (const u of myUnits()) {
        if (u.uid < 9000 && inBox(u)) selected.add(u.uid);
      }
      if (selected.size > 0) uiClick();
      updateInfoPanels();
    },
    sig,
  );

  window.addEventListener(
    "keydown",
    (e) => {
      if (mode !== "orders") return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        undoLastBatch();
        return;
      }
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
        case "w":
        case "W":
          if (selectedUnits().length > 0) waitOrderPopup();
          break;
        case "Escape":
          selected.clear();
          generalSelected = false;
          ghostTargets = new Map();
          hidePopup();
          updateInfoPanels();
          break;
      }
    },
    sig,
  );

  function waitOrderPopup(): void {
    const conds = new Set<"disorder" | "morale" | "fatigue">();
    const condRow = el("div", { class: "field-popup-actions" });
    for (const c of ["disorder", "morale", "fatigue"] as const) {
      const b = el("button", { class: "btn-plain" }, `until ${c} recovered`);
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (conds.has(c)) {
          conds.delete(c);
          b.classList.remove("is-on");
        } else {
          conds.add(c);
          b.classList.add("is-on");
        }
      });
      condRow.append(b);
    }
    showPopup(
      "Rest how hard? Waiting banks recovery (§4.3.8).",
      ([25, 50, 75, 100] as const).map((pct) => [
        `${pct}%`,
        () => {
          issueOrders(selectedUnits(), () => ({ type: "wait", pct, until: [...conds] }));
          hidePopup();
        },
      ]),
      condRow,
    );
  }

  function unitAtPoint(units: BattleUnit[], wx: number, wy: number): BattleUnit | null {
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i]!;
      // a general's escort is a star on the map, so it takes star-sized clicks
      if (u.uid >= 9000) {
        if (Math.hypot(wx - u.x, wy - u.y) <= 70) return u;
      } else if (containsPoint(u, wx, wy)) {
        return u;
      }
    }
    return null;
  }

  /* ---------- buttons ---------- */

  hornBtn.addEventListener("click", () => {
    if (hornBlown || brilliancyLeft[actor] <= 0) return;
    hornBlown = true;
    brilliancyLeft[actor]--;
    budgetTotal += 3; // §4.2.2
    alalai();
    setHint("The horn sounds — three bonus orders this phase. Brilliancy is spent forever.");
    refreshHud();
    renderGeneralPanel();
  });

  recallBtn.addEventListener("click", recallSelected);

  retreatBtn.addEventListener("click", () => {
    showPopup(`Sound the retreat? Player ${actor + 1} concedes the field.`, [
      [
        "Retreat",
        () => {
          finishBattle(
            state,
            (1 - actor) as PlayerId,
            `Player ${actor + 1} sounds the retreat — the field is abandoned.`,
          );
          hidePopup();
          finished = true;
          abort.abort();
          timer?.stop();
          onDone(state);
        },
      ],
      ["Stand and fight", hidePopup],
    ]);
  });

  doneBtn.addEventListener("click", () => {
    if (mode !== "orders") return;
    endPhase();
  });

  /* ---------- projections & rendering ---------- */

  function projections(): { ghosts: GhostUnit[]; lines: SceneLine[] } {
    const ghosts: GhostUnit[] = [];
    const lines: SceneLine[] = [];
    if (mode !== "orders") return { ghosts, lines };
    for (const u of myUnits()) {
      const o = u.order;
      if (!o) continue;
      if (o.type === "march") {
        // §4.1.1 — final projection + this-phase reach + the path
        ghosts.push({ x: o.dest.x, y: o.dest.y, angle: o.dest.angle, valid: true });
        const d = Math.hypot(o.dest.x - u.x, o.dest.y - u.y) || 1;
        const reach = Math.min(d, speedBudgetM(u) * (o.fast ? 1.5 : 1));
        const rx = u.x + ((o.dest.x - u.x) / d) * reach;
        const ry = u.y + ((o.dest.y - u.y) / d) * reach;
        lines.push({ x1: u.x, y1: u.y, x2: o.dest.x, y2: o.dest.y, color: "rgba(80,200,90,0.55)", width: 10, dash: [40, 40] });
        lines.push({ x1: u.x, y1: u.y, x2: rx, y2: ry, color: "rgba(80,200,90,0.9)", width: 14 });
      } else if (o.type === "attack" || o.type === "skirmish" || o.type === "face" || o.type === "avoid") {
        for (const t of o.targets) {
          const e = state.units.find((x) => x.uid === t && !x.removed && !x.fled);
          if (!e) continue;
          const color =
            o.type === "attack"
              ? "rgba(210,74,46,0.8)"
              : o.type === "skirmish"
                ? "rgba(224,178,94,0.8)"
                : "rgba(150,141,128,0.8)";
          lines.push({ x1: u.x, y1: u.y, x2: e.x, y2: e.y, color, width: 10, dash: o.type === "attack" ? [] : [30, 30] });
        }
      }
    }
    // live perno preview while dragging a march order
    if (drag.kind === "place") {
      for (const t of ghostTargets.values()) {
        ghosts.push({ x: t.x, y: t.y, angle: t.angle, valid: true });
      }
    }
    // the general's glance radius, always visible while giving orders
    const g = generalOf(state, actor);
    if (g.condition !== "dead") {
      const [gx, gy] = generalPosition(state, g);
      lines.push(...glanceRingLines(gx, gy));
    }
    return { ghosts, lines };
  }

  function displayUnits(): FieldUnit[] {
    if (playback) {
      const t = Math.min(1, (performance.now() - playback.start) / PLAYBACK_MS);
      const ticks = playback.frames.ticks;
      const ft = t * ticks;
      const i0 = Math.min(ticks, Math.floor(ft));
      const i1 = Math.min(ticks, i0 + 1);
      const frac = ft - i0;
      const out: FieldUnit[] = [];
      for (const u of liveUnits(state)) {
        const path = playback.frames.paths.get(u.uid);
        if (!path || path.length === 0) {
          out.push(u);
          continue;
        }
        const a = path[Math.min(i0, path.length - 1)]!;
        const b = path[Math.min(i1, path.length - 1)]!;
        out.push({ ...u, x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac, angle: b.angle });
      }
      return out;
    }
    return liveUnits(state);
  }

  loadMapImage(state.def, () => undefined);

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
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const proj = projections();
    const disp = displayUnits();
    drawScene(ctx, {
      def: state.def,
      cam,
      // escorts render as the general's star, never as a rectangle
      units: disp.filter((u) => u.uid < 9000),
      generals: state.generals
        .filter((g) => g.condition === "fighting")
        .map((g) => {
          const hostUid = g.attachedTo ?? g.unitUid;
          const host = disp.find((u) => u.uid === hostUid);
          return {
            player: g.player,
            x: host?.x ?? g.x,
            y: host?.y ?? g.y,
            attachedTo: g.attachedTo,
          };
        }),
      selected,
      generalSelected: generalSelected || selected.has(9000 + actor),
      ghosts: proj.ghosts,
      lines: proj.lines,
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  startPhase("command", 0);
  return root;
}
