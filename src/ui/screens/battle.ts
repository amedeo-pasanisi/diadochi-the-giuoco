import { clear, el, fromHTML } from "../dom";
import { applyMeander } from "../art/ornaments";
import { createTimer, type PhaseTimer } from "../components/timer";
import { attachTooltip, unitTooltipHTML } from "../components/tooltip";
import { unitArtSVG } from "../art/unitArt";
import { coinSVG } from "../art/coinArt";
import { alalai, dismissThud, marchHorn, uiClick } from "../sound";
import { Camera } from "../field/camera";
import {
  drawScene,
  loadMapImage,
  type GhostUnit,
  type SceneFx,
  type SceneLine,
} from "../field/fieldRenderer";
import { glanceRingLines, pernoTargets, type PernoTarget } from "../field/formation";
import type { PlayerId, UnitDef } from "../../engine/types";
import { UNIT_DEFS } from "../../engine/data/units";
import { GENERAL_DEFS } from "../../engine/data/generals";
import type { Rng } from "../../engine/rng";
import { containsPoint, type FieldUnit } from "../../engine/field";
import {
  COMMAND_SECONDS,
  GLANCE_SECONDS,
  canBeFast,
  commandPool,
  glancePool,
  orderCost,
  type Order,
} from "../../engine/battle/orders";
import {
  attachGeneralTo,
  detachGeneralFrom,
  fatigueLevels,
  generalOf,
  generalPosition,
  liveUnits,
  speedBudgetM,
  unitByUid,
  victoryBar,
  type BattleState,
  type BattleUnit,
} from "../../engine/battle/state";
import {
  finishBattle,
  previewBattlePhase,
  resolveBattlePhase,
  type Keyframes,
} from "../../engine/battle/resolve";

const PLAYBACK_MS = 4200;

type PhaseKind = "command" | "glance";
type Mode = "curtain" | "orders" | "playback" | "events";

interface OrderBatch {
  uids: number[];
  cost: number;
}

/** A flavourful reading of how the battle leans, for the acting player. */
function nikePhrase(bar: number, actor: PlayerId): string {
  const mine = actor === 0 ? bar : -bar; // positive = winning
  if (mine >= 70) return "Nike spreads her wings above our standards";
  if (mine >= 35) return "The gods lean our way — press the advantage";
  if (mine >= 12) return "The omens are fair, but nothing is won yet";
  if (mine > -12) return "Ares weighs both sides in an even hand";
  if (mine > -35) return "The line trembles — Nike looks elsewhere";
  if (mine > -70) return "Victory is flying away from us";
  return "The gods have turned their backs on our army";
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
  let mode: Mode = "curtain";
  let budgetTotal = 0;
  let hornBlown = false;
  const brilliancyLeft: [number, number] = [
    GENERAL_DEFS[state.musters[0].general!].brilliancy,
    GENERAL_DEFS[state.musters[1].general!].brilliancy,
  ];
  let batches: OrderBatch[] = [];
  let timer: PhaseTimer | null = null;
  let playback: { frames: Keyframes; fx: BattleFxLocal[]; start: number } | null = null;
  let lastReplay: { frames: Keyframes; fx: BattleFxLocal[] } | null = null;
  let generalSelected = false;
  let ghostTargets = new Map<number, PernoTarget>();
  let previewFrames: Keyframes | null = null;
  let logOpen = false;
  let finished = false;
  const abort = new AbortController();

  /* ---------- DOM ---------- */

  const canvas = el("canvas", { class: "field-canvas" }) as HTMLCanvasElement;
  const hint = el("div", { class: "player-sub deploy-hint" }, "");
  const setHint = (t: string): void => {
    hint.textContent = t;
  };

  const nikeText = el("div", { class: "nike-text" }, "");
  const nikeFill = el("div", { class: "nike-fill" });
  const nikeBar = el(
    "div",
    { class: "nike-bar" },
    nikeText,
    el("div", { class: "nike-track" }, nikeFill, el("div", { class: "nike-tick" })),
  );
  attachTooltip(nikeBar, () => `<h4>The scales of the battle</h4><div class="tt-role">White strength against black. When it tips fully to ±100% the battle ends; a losing tilt drains your army's courage.</div>`);

  /* commander HUD (top-left) */
  const portraitBox = el("div", { class: "cmd-portrait" });
  const cmdRow = el("div", { class: "cmd-stat-row", "data-phase": "command" });
  const glanceRow = el("div", { class: "cmd-stat-row", "data-phase": "glance" });
  const brillRow = el("div", { class: "cmd-stat-row" });
  const statsCol = el("div", { class: "cmd-stats" }, cmdRow, glanceRow, brillRow);

  const sendBtn = el("button", { class: "btn-marble cmd-send" }, "Send Messengers") as HTMLButtonElement;
  const shoutBtn = el("button", { class: "btn-marble cmd-shout" }, "Shout Orders") as HTMLButtonElement;
  const hornBtn = el("button", { class: "btn-plain cmd-horn" }, "Blow Horn") as HTMLButtonElement;
  const recallBtn = el("button", { class: "btn-plain" }, "Recall Orders") as HTMLButtonElement;
  const retreatBtn = el("button", { class: "btn-plain" }, "Sound Retreat") as HTMLButtonElement;
  const rememberBtn = el("button", { class: "btn-plain" }, "Calliope ↺") as HTMLButtonElement;
  const logBtn = el("button", { class: "btn-plain" }, "Scribe's Log") as HTMLButtonElement;

  const btnCol = el(
    "div",
    { class: "cmd-buttons" },
    el("div", { class: "cmd-btn-line" }, sendBtn),
    el("div", { class: "cmd-btn-line" }, shoutBtn),
    el("div", { class: "cmd-btn-line" }, hornBtn),
    el("div", { class: "cmd-btn-line cmd-btn-minor" }, recallBtn, retreatBtn, rememberBtn, logBtn),
  );

  const commanderHud = el(
    "div",
    { class: "commander-hud" },
    portraitBox,
    statsCol,
    el("div", { class: "cmd-linker" }),
    btnCol,
  );

  attachTooltip(cmdRow, () => `<h4>Command orders</h4><div class="tt-role">3 + your general's Command each Command Phase. A formation move costs one order per group whose units stay within 200 m. Orders to the general's own unit are free.</div>`);
  attachTooltip(glanceRow, () => `<h4>Glance orders</h4><div class="tt-role">Bonus orders equal to your general's Glance, spendable only on units within 500 m of him — during the Glance Phase, as the lines close.</div>`);
  attachTooltip(brillRow, () => `<h4>Brilliancy</h4><div class="tt-role">Blow the horn to spend one point for +3 orders this phase. Spent points never return.</div>`);
  attachTooltip(hornBtn, () => `<h4>Blow the horn</h4><div class="tt-role">Spend one Brilliancy for three bonus orders now. Genius is finite.</div>`);
  attachTooltip(rememberBtn, () => `<h4>Calliope's memory</h4><div class="tt-role">Watch the last Battle Phase play out again.</div>`);
  attachTooltip(logBtn, () => `<h4>The scribe's log</h4><div class="tt-role">The bare arithmetic behind the last clash — every roll the gods made.</div>`);

  const header = el("div", { class: "battle-header" }, nikeBar, commanderHud, hint);

  /* info panels */
  const cardsRow = el("div", { class: "field-cards" });
  const infoPanel = el("div", { class: "tooltip field-panel" });
  const unitPanel = el("div", { class: "field-panel-bl" }, cardsRow, infoPanel);
  unitPanel.style.display = "none";

  const enemyPanel = el("div", { class: "tooltip field-panel field-panel-enemy" });
  enemyPanel.style.display = "none";

  const logPanel = el("div", { class: "battle-log" });
  logPanel.style.display = "none";

  const popup = el("div", { class: "papyrus-panel field-popup" });
  popup.style.display = "none";
  const curtain = el("div", { class: "battle-curtain" });

  const fieldWrap = el(
    "div",
    { class: "field-wrap" },
    canvas,
    unitPanel,
    enemyPanel,
    logPanel,
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
  const generalName = (): string => GENERAL_DEFS[state.musters[actor].general!].name;

  function orderable(u: BattleUnit): boolean {
    if (u.status !== "normal") return false; // §4.2.3
    if (phase === "glance") {
      const g = generalOf(state, actor);
      if (g.condition === "dead") return false;
      const [gx, gy] = generalPosition(state, g);
      if (Math.hypot(u.x - gx, u.y - gy) > 500) return false;
    }
    return true;
  }

  /** The general's own unit and the unit he rides with cost no orders. */
  function isFreeUnit(u: BattleUnit): boolean {
    const g = generalOf(state, actor);
    return u.uid === g.unitUid || u.uid === g.attachedTo;
  }

  function costOf(units: BattleUnit[]): number {
    const paid = units.filter((u) => !isFreeUnit(u));
    return paid.length === 0 ? 0 : orderCost(paid);
  }

  function spent(): number {
    return batches.reduce((s, b) => s + b.cost, 0);
  }
  function remaining(): number {
    return budgetTotal - spent();
  }

  /* ---------- HUD rendering ---------- */

  function dots(filled: number, total: number, cls: string): string {
    let s = "";
    for (let i = 0; i < total; i++) {
      s += `<span class="dot ${i < filled ? cls : "dot-empty"}"></span>`;
    }
    return s;
  }

  function refreshHud(): void {
    const gid = state.musters[actor].general!;
    const g = GENERAL_DEFS[gid];
    const bg = generalOf(state, actor);

    // portrait + charisma
    const cond =
      bg.condition === "dead"
        ? '<span class="cmd-cond dead">fallen</span>'
        : bg.condition === "fled"
          ? '<span class="cmd-cond dead">fled · halved</span>'
          : "";
    portraitBox.innerHTML = `
      <div class="cmd-coin">${coinSVG(g, 92)}</div>
      <div class="cmd-name">${g.name} ${cond}</div>
      <div class="cmd-charisma"><span class="cmd-lbl">Charisma</span> ${dots(g.charisma, 3, "dot-charisma")}</div>`;

    // command row: order pool = 3 + Command (+3 if horn blown this cmd phase)
    const cmdBase = 3 + g.command;
    const cmdTotal = cmdBase + (phase === "command" && hornBlown ? 3 : 0);
    const cmdLeft = phase === "command" ? remaining() : cmdTotal;
    cmdRow.innerHTML =
      `<span class="cmd-lbl">Command · ${cmdBase}</span>` + dots(cmdLeft, cmdTotal, "dot-command");
    // glance row
    const glTotal = g.glance + (phase === "glance" && hornBlown ? 3 : 0);
    const glLeft = phase === "glance" ? remaining() : glTotal;
    glanceRow.innerHTML =
      `<span class="cmd-lbl">Glance · ${g.glance}</span>` + dots(glLeft, glTotal, "dot-glance");
    // brilliancy row
    brillRow.innerHTML =
      `<span class="cmd-lbl">Brilliancy</span>` + dots(brilliancyLeft[actor], 3, "dot-brill");

    cmdRow.classList.toggle("is-active", phase === "command");
    glanceRow.classList.toggle("is-active", phase === "glance");

    // buttons
    sendBtn.style.display = phase === "command" ? "" : "none";
    shoutBtn.style.display = phase === "glance" ? "" : "none";
    hornBtn.disabled = hornBlown || brilliancyLeft[actor] <= 0 || bg.condition === "dead";
    rememberBtn.disabled = lastReplay === null;

    // Nike bar (positive favours P1 = white)
    const bar = victoryBar(state);
    nikeFill.style.width = `${Math.max(0, Math.min(100, 50 + bar / 2))}%`;
    nikeText.textContent = nikePhrase(bar, actor);
  }

  /* ---------- info panels ---------- */

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

  /** A short line of the live afflictions on a unit. */
  function conditionLine(u: BattleUnit): string {
    const bits: string[] = [];
    bits.push(`<span class="cond-morale cond-m${Math.max(1, Math.min(3, u.morale))}">morale ${u.morale}/3</span>`);
    if (u.casualties > 0) bits.push(`<span class="cond-bad">casualties ${u.casualties}</span>`);
    if (u.disorder > 0) bits.push(`<span class="cond-bad">disorder ${u.disorder}</span>`);
    const fl = fatigueLevels(u);
    if (fl > 0) bits.push(`<span class="cond-bad">fatigue ${fl}</span>`);
    if (u.status !== "normal") bits.push(`<span class="cond-bad">${u.status}</span>`);
    return `<div class="cond-line">${bits.join(" · ")}</div>`;
  }

  function updateInfoPanels(): void {
    clear(cardsRow);
    const sel = selectedUnits();
    if (sel.length === 0) {
      unitPanel.style.display = "none";
      return;
    }
    unitPanel.style.display = "flex";
    if (sel.some((u) => u.uid >= 9000)) {
      const g = GENERAL_DEFS[state.musters[actor].general!];
      const h = UNIT_DEFS.hetairoi;
      cardsRow.append(miniCard(h, g.name, 1, "the general's guard"));
      infoPanel.innerHTML =
        `<h4>${g.name}</h4><div class="tt-epithet">fights as ${h.name}</div>` +
        conditionLine(sel[0]!) +
        `<div class="tt-role">${g.role}</div>
         <div class="tt-note">Right-click a friendly unit within 400 m to attach; attached units roll with Advantage (§4.4).</div>`;
      return;
    }
    const groups = new Map<string, { def: UnitDef; units: BattleUnit[] }>();
    for (const u of sel) {
      const d = UNIT_DEFS[u.unit];
      const e = groups.get(d.id) ?? { def: d, units: [] };
      e.units.push(u);
      groups.set(d.id, e);
    }
    const entries = [...groups.values()];
    const singleHTML = (e: { def: UnitDef; units: BattleUnit[] }): string =>
      unitTooltipHTML(e.def, undefined, { cost: false }) +
      (e.units.length === 1 ? conditionLine(e.units[0]!) : "");
    const defaultHTML =
      entries.length === 1
        ? singleHTML(entries[0]!)
        : `<h4>${sel.length} units</h4><div class="tt-role">A mixed body of ${entries.length} kinds.</div>` +
          entries.map((e) => `<div>${e.def.name} ×${e.units.length}</div>`).join("");
    infoPanel.innerHTML = defaultHTML;
    entries.forEach((e, i) => {
      const card = miniCard(e.def, e.def.name, e.units.length, e.def.epithet.split("—")[1]?.trim() ?? "");
      if (entries.length > 1) {
        card.classList.add("is-fanned");
        card.style.zIndex = String(10 + i);
      }
      card.addEventListener("mouseenter", () => {
        infoPanel.innerHTML = singleHTML(e);
      });
      card.addEventListener("mouseleave", () => {
        infoPanel.innerHTML = defaultHTML;
      });
      cardsRow.append(card);
    });
  }

  function showEnemyPanel(u: BattleUnit): void {
    const d = UNIT_DEFS[u.unit];
    enemyPanel.style.display = "block";
    enemyPanel.innerHTML =
      `<div class="enemy-tag">Enemy</div>` +
      unitTooltipHTML(d, undefined, { cost: false }) +
      conditionLine(u);
  }
  function hideEnemyPanel(): void {
    enemyPanel.style.display = "none";
  }

  /* ---------- flavourful confirmations ---------- */

  function confirm(message: string, confirmLabel: string, onYes: () => void): void {
    showPopup(message, [
      [confirmLabel, () => {
        hidePopup();
        onYes();
      }],
      ["Not yet", hidePopup],
    ]);
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
    previewFrames = null;
    hideEnemyPanel();
    const gid = state.musters[a].general!;
    const g = generalOf(state, a);
    const mult = g.condition === "fled" ? 0.5 : 1;
    budgetTotal =
      g.condition === "dead"
        ? 0
        : Math.floor((p === "command" ? commandPool(gid) : glancePool(gid)) * mult);
    showCurtain(
      `Player ${a + 1} — ${p === "command" ? "Command" : "Glance"} Phase`,
      p === "command"
        ? "Messengers wait by your tent. Your rival must look away."
        : "A last look across the field before the lines meet.",
      () => {
        mode = "orders";
        if (p === "glance") previewFrames = previewBattlePhase(state);
        timer?.stop();
        timer = createTimer(p === "command" ? COMMAND_SECONDS : GLANCE_SECONDS, () => endPhase());
        refreshHud();
        updateInfoPanels();
      },
    );
  }

  function endPhase(): void {
    hidePopup();
    selected.clear();
    generalSelected = false;
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
      const fx: BattleFxLocal[] = state.fx.map((f) => ({ ...f }));
      playback = { frames, fx, start: performance.now() };
      lastReplay = { frames, fx };
      window.setTimeout(() => {
        playback = null;
        showEvents();
      }, PLAYBACK_MS + 250);
    });
  }

  function replayLast(): void {
    if (!lastReplay) return;
    mode = "playback";
    hidePopup();
    playback = { frames: lastReplay.frames, fx: lastReplay.fx, start: performance.now() };
    window.setTimeout(() => {
      playback = null;
      if (!state.finished) refreshHud();
    }, PLAYBACK_MS + 250);
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
    const actions: [string, () => void][] = [
      ["Calliope ↺ (rewatch)", replayLast],
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
    ];
    showPopup(`Turn ${state.turn - 1} — the field speaks`, actions, list);
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

  function removeFromBatches(uids: number[]): void {
    const kept: OrderBatch[] = [];
    for (const b of batches) {
      const rest = b.uids.filter((uid) => !uids.includes(uid));
      if (rest.length === b.uids.length) {
        kept.push(b);
      } else if (rest.length > 0) {
        const units = rest.map((uid) => unitByUid(state, uid)).filter(Boolean) as BattleUnit[];
        kept.push({ uids: rest, cost: costOf(units) });
      }
      // fully-emptied batches are dropped (their cost refunded implicitly)
    }
    batches = kept;
  }

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
    // re-ordering a unit refunds its slice of any previous order
    removeFromBatches(eligible.map((u) => u.uid));
    const cost = costOf(eligible);
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
    uiClick();
    if (phase === "glance") previewFrames = previewBattlePhase(state);
    refreshHud();
  }

  function recallSelected(): void {
    const sel = selectedUnits();
    if (sel.length === 0) return;
    removeFromBatches(sel.map((u) => u.uid));
    for (const u of sel) u.order = null;
    uiClick();
    if (phase === "glance") previewFrames = previewBattlePhase(state);
    refreshHud();
  }

  function undoLastBatch(): void {
    const b = batches.pop();
    if (!b) return;
    for (const uid of b.uids) {
      const u = unitByUid(state, uid);
      if (u) u.order = null;
    }
    uiClick();
    if (phase === "glance") previewFrames = previewBattlePhase(state);
    refreshHud();
  }

  function upgradeLastFast(): void {
    const b = batches[batches.length - 1];
    if (!b) return;
    let changed = false;
    for (const uid of b.uids) {
      const u = unitByUid(state, uid);
      if (u?.order && canBeFast(u.order) && !u.order.fast) {
        u.order.fast = true;
        changed = true;
      }
    }
    if (changed) {
      marchHorn();
      setHint("Fast pace! They will arrive sooner — and wearier.");
      if (phase === "glance") previewFrames = previewBattlePhase(state);
    }
  }

  /* ---------- input ---------- */

  type Drag =
    | { kind: "none" }
    | { kind: "box"; x0: number; y0: number; x1: number; y1: number }
    | { kind: "place"; downW: [number, number]; curW: [number, number]; shift: boolean }
    | { kind: "pan"; lastX: number; lastY: number };
  let drag: Drag = { kind: "none" };
  let lastRight = { t: 0, x: 0, y: 0 };
  const keysDown = new Set<string>();

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
  window.addEventListener("keyup", (e) => keysDown.delete(e.key.toLowerCase()), sig);

  function unitAtPoint(units: BattleUnit[], wx: number, wy: number): BattleUnit | null {
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i]!;
      if (u.uid >= 9000) {
        if (Math.hypot(wx - u.x, wy - u.y) <= 70) return u;
      } else if (containsPoint(u, wx, wy)) {
        return u;
      }
    }
    return null;
  }

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
        // the general's star wins the click
        const g = generalOf(state, actor);
        const [ggx, ggy] = generalPosition(state, g);
        if (g.condition === "fighting" && Math.hypot(wx - ggx, wy - ggy) <= 70) {
          selectGeneral();
          return;
        }
        const u = unitAtPoint(myUnits().filter((x) => x.uid < 9000), wx, wy);
        if (u) {
          generalSelected = false;
          if (!e.shiftKey) selected.clear();
          if (e.shiftKey && selected.has(u.uid)) selected.delete(u.uid);
          else selected.add(u.uid);
          uiClick();
          hideEnemyPanel();
          updateInfoPanels();
          return;
        }
        const en = unitAtPoint(enemyUnits(), wx, wy);
        if (en) {
          showEnemyPanel(en);
          return;
        }
        // empty ground: left-drag boxes a selection
        drag = { kind: "box", x0: sx, y0: sy, x1: sx, y1: sy };
        return;
      }

      if (e.button === 2) {
        const now = performance.now();
        const dbl = now - lastRight.t < 400 && Math.hypot(sx - lastRight.x, sy - lastRight.y) < 24;
        lastRight = { t: now, x: sx, y: sy };
        if (dbl) {
          upgradeLastFast();
          return;
        }
        const sel = selectedUnits();
        const enemy = unitAtPoint(enemyUnits(), wx, wy);

        if (generalSelected && !enemy) {
          const friendly = unitAtPoint(myUnits().filter((x) => x.uid < 9000), wx, wy);
          if (friendly) {
            const esc = g_escort();
            if (esc && Math.hypot(esc.x - friendly.x, esc.y - friendly.y) <= 400) {
              confirm(
                `Send ${generalName()} to ride with the ${UNIT_DEFS[friendly.unit].name}?`,
                "Attach",
                () => {
                  attachGeneralTo(state, actor, friendly.uid);
                  selected.clear();
                  generalSelected = false;
                  uiClick();
                  setHint(`${generalName()} rides at their centre.`);
                  updateInfoPanels();
                  refreshHud();
                },
              );
            } else {
              dismissThud();
              setHint(`${generalName()} must ride within 400 m to attach — move him closer.`);
            }
            return;
          }
        }
        if (sel.length === 0) {
          drag = { kind: "pan", lastX: sx, lastY: sy };
          return;
        }
        if (enemy) {
          issueEnemyOrder(sel, enemy, e.shiftKey);
          return;
        }
        // march to ground with the perno drag
        drag = { kind: "place", downW: [wx, wy], curW: [wx, wy], shift: e.shiftKey };
        ghostTargets = pernoTargets(sel, drag.downW, drag.curW, drag.shift);
      }
    },
    sig,
  );

  function g_escort(): BattleUnit | undefined {
    const g = generalOf(state, actor);
    return g.unitUid >= 0 ? unitByUid(state, g.unitUid) : undefined;
  }

  function issueEnemyOrder(sel: BattleUnit[], enemy: BattleUnit, shift: boolean): void {
    if (keysDown.has("f")) {
      issueOrders(sel, () => ({ type: "face", targets: [enemy.uid], fast: false }));
    } else if (keysDown.has("s")) {
      issueOrders(sel, () => ({ type: "skirmish", targets: [enemy.uid], fast: false }));
    } else if (keysDown.has("a")) {
      issueOrders(sel, () => ({ type: "avoid", targets: [enemy.uid], fast: false }));
    } else {
      issueOrders(sel, () => ({ type: "attack", targets: [enemy.uid], fast: false, secondary: shift }));
    }
  }

  function selectGeneral(): void {
    const g = generalOf(state, actor);
    selected.clear();
    generalSelected = true;
    uiClick();
    if (g.attachedTo !== null) {
      const host = unitByUid(state, g.attachedTo);
      showPopup(`${generalName()} rides with the ${host ? UNIT_DEFS[host.unit].name : "ranks"}.`, [
        [
          "Detach him",
          () => {
            detachGeneralFrom(state, actor);
            selected.clear();
            selected.add(9000 + actor);
            generalSelected = true;
            hidePopup();
            uiClick();
            setHint(`${generalName()} takes his own station.`);
            updateInfoPanels();
            refreshHud();
          },
        ],
        ["Leave him", hidePopup],
      ]);
    } else {
      selected.add(g.unitUid);
      setHint(`${generalName()} awaits — right-click ground to ride, a unit to attach.`);
    }
    updateInfoPanels();
  }

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
      if (drag.kind === "box" && e.button === 0) {
        const b = drag;
        drag = { kind: "none" };
        const bx0 = Math.min(b.x0, b.x1);
        const bx1 = Math.max(b.x0, b.x1);
        const by0 = Math.min(b.y0, b.y1);
        const by1 = Math.max(b.y0, b.y1);
        if (bx1 - bx0 < 6 && by1 - by0 < 6) {
          selected.clear();
          generalSelected = false;
          updateInfoPanels();
          return;
        }
        generalSelected = false;
        if (!e.shiftKey) selected.clear();
        for (const u of myUnits()) {
          if (u.uid >= 9000) continue;
          const [ssx, ssy] = cam.toScreen(u.x, u.y);
          if (ssx >= bx0 && ssx <= bx1 && ssy >= by0 && ssy <= by1) selected.add(u.uid);
        }
        if (selected.size > 0) uiClick();
        updateInfoPanels();
        return;
      }
      if (drag.kind === "pan" && (e.button === 0 || e.button === 1 || e.button === 2)) {
        drag = { kind: "none" };
      }
    },
    sig,
  );

  window.addEventListener(
    "keydown",
    (e) => {
      keysDown.add(e.key.toLowerCase());
      if (mode !== "orders") return;
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        undoLastBatch();
        return;
      }
      const pan = 90;
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
        case "w":
        case "W":
          if (selectedUnits().length > 0) waitOrderPopup();
          break;
        case "Escape":
          selected.clear();
          generalSelected = false;
          ghostTargets = new Map();
          hidePopup();
          hideEnemyPanel();
          updateInfoPanels();
          break;
      }
    },
    sig,
  );

  function waitOrderPopup(): void {
    const conds = new Set<"disorder" | "morale" | "fatigue">();
    const condRow = el("div", { class: "field-popup-actions wait-conds" });
    for (const c of ["disorder", "morale", "fatigue"] as const) {
      const b = el("button", { class: "btn-plain" }, `until ${c}`);
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
      "Rest how hard? Waiting banks recovery.",
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

  /* ---------- buttons ---------- */

  hornBtn.addEventListener("click", () => {
    if (hornBtn.disabled) return;
    confirm(
      `Sound the war-horn and spend a point of Brilliancy for three more orders? It will not come again.`,
      "Blow it",
      () => {
        hornBlown = true;
        brilliancyLeft[actor]--;
        budgetTotal += 3;
        alalai();
        setHint("The horn sounds — three bonus orders this phase.");
        refreshHud();
      },
    );
  });
  recallBtn.addEventListener("click", () => {
    if (selectedUnits().length === 0) {
      setHint("Select the units whose orders you would recall.");
      return;
    }
    confirm("Recall the orders of the chosen units?", "Recall", recallSelected);
  });
  retreatBtn.addEventListener("click", () => {
    confirm(
      `Sound the retreat? Player ${actor + 1} yields the field, and the day, to the enemy.`,
      "Sound it",
      () => {
        finishBattle(
          state,
          (1 - actor) as PlayerId,
          `Player ${actor + 1} sounds the retreat — the field is abandoned.`,
        );
        finished = true;
        abort.abort();
        timer?.stop();
        onDone(state);
      },
    );
  });
  rememberBtn.addEventListener("click", replayLast);
  logBtn.addEventListener("click", () => {
    logOpen = !logOpen;
    renderLog();
  });
  function renderLog(): void {
    if (!logOpen) {
      logPanel.style.display = "none";
      return;
    }
    logPanel.style.display = "block";
    clear(logPanel);
    logPanel.append(el("div", { class: "log-title" }, "Scribe's Log — last clash"));
    const body = el("div", { class: "log-body" });
    if (state.log.length === 0) body.append(el("div", {}, "No blows exchanged yet."));
    for (const line of state.log) body.append(el("div", { class: "log-line" }, line));
    logPanel.append(body);
  }
  sendBtn.addEventListener("click", () => {
    if (mode !== "orders") return;
    confirm("The messengers ride to the ranks with your orders. Send them?", "Send", endPhase);
  });
  shoutBtn.addEventListener("click", () => {
    if (mode !== "orders") return;
    confirm("Shout your final orders across the din. Ready?", "Shout", endPhase);
  });

  /* ---------- projections & rendering ---------- */

  function projections(): { ghosts: GhostUnit[]; lines: SceneLine[] } {
    const ghosts: GhostUnit[] = [];
    const lines: SceneLine[] = [];
    if (mode !== "orders") return { ghosts, lines };
    const escortUid = generalOf(state, actor).unitUid;
    for (const u of myUnits()) {
      const o = u.order;
      if (!o) continue;
      const isGen = u.uid === escortUid || u.uid === generalOf(state, actor).attachedTo;
      if (o.type === "march" || o.type === "attack") {
        const dest =
          o.type === "march"
            ? o.dest
            : (() => {
                const t = state.units.find((x) => x.uid === o.targets[0] && !x.removed && !x.fled);
                return t ? { x: t.x, y: t.y, angle: u.angle } : null;
              })();
        if (!dest) continue;
        ghosts.push({ x: dest.x, y: dest.y, angle: dest.angle, valid: true, circle: isGen });
        // reach this phase, for BOTH march and attack (§4.1.1)
        const d = Math.hypot(dest.x - u.x, dest.y - u.y) || 1;
        const reach = Math.min(d, speedBudgetM(u) * (o.fast ? 1.5 : 1));
        const rx = u.x + ((dest.x - u.x) / d) * reach;
        const ry = u.y + ((dest.y - u.y) / d) * reach;
        const col = o.type === "attack" ? "rgba(210,74,46,0.9)" : "rgba(196,92,255,0.9)";
        lines.push({ x1: u.x, y1: u.y, x2: dest.x, y2: dest.y, color: "rgba(196,92,255,0.5)", width: 9, dash: [40, 40] });
        lines.push({ x1: u.x, y1: u.y, x2: rx, y2: ry, color: col, width: 14 });
      } else if (o.type === "skirmish" || o.type === "face" || o.type === "avoid") {
        for (const t of o.targets) {
          const en = state.units.find((x) => x.uid === t && !x.removed && !x.fled);
          if (!en) continue;
          const color =
            o.type === "skirmish"
              ? "rgba(224,178,94,0.85)"
              : o.type === "avoid"
                ? "rgba(150,141,128,0.85)"
                : "rgba(196,92,255,0.8)";
          lines.push({ x1: u.x, y1: u.y, x2: en.x, y2: en.y, color, width: 9, dash: [30, 30] });
        }
      }
    }
    if (drag.kind === "place") {
      const sel = selectedUnits();
      for (const [uid, t] of ghostTargets) {
        ghosts.push({ x: t.x, y: t.y, angle: t.angle, valid: true, circle: sel.find((u) => u.uid === uid)?.uid === escortUid });
      }
    }
    const g = generalOf(state, actor);
    if (g.condition !== "dead") {
      const [gx, gy] = generalPosition(state, g);
      lines.push(...glanceRingLines(gx, gy));
    }
    return { ghosts, lines };
  }

  function interpUnits(frames: Keyframes, t: number): FieldUnit[] {
    const ticks = frames.ticks;
    const ft = t * ticks;
    const i0 = Math.min(ticks, Math.floor(ft));
    const i1 = Math.min(ticks, i0 + 1);
    const frac = ft - i0;
    const out: FieldUnit[] = [];
    for (const u of liveUnits(state)) {
      const path = frames.paths.get(u.uid);
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

  function activeFx(fx: BattleFxLocal[], t: number): SceneFx[] {
    const out: SceneFx[] = [];
    for (const f of fx) {
      const age = (t - f.at) / 0.14;
      if (age >= 0 && age <= 1) out.push({ ...f, age });
    }
    return out;
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

    let units: FieldUnit[];
    let fx: SceneFx[] | undefined;
    let ghostUnits: FieldUnit[] | undefined;
    if (playback) {
      const t = Math.min(1, (performance.now() - playback.start) / PLAYBACK_MS);
      units = interpUnits(playback.frames, t);
      fx = activeFx(playback.fx, t);
    } else {
      units = liveUnits(state);
      // Glance-phase preview: translucent projection of the coming phase,
      // looping, showing where both armies end up (§4.2.1)
      if (mode === "orders" && phase === "glance" && previewFrames) {
        const t = ((performance.now() / PLAYBACK_MS) % 1);
        ghostUnits = interpUnits(previewFrames, t).filter((u) => u.uid < 9000);
      }
    }

    const proj = mode === "orders" ? projections() : { ghosts: [], lines: [] };
    drawScene(ctx, {
      def: state.def,
      cam,
      units: units.filter((u) => u.uid < 9000),
      generals: state.generals
        .filter((g) => g.condition === "fighting")
        .map((g) => {
          const hostUid = g.attachedTo ?? g.unitUid;
          const host = units.find((u) => u.uid === hostUid);
          return { player: g.player, x: host?.x ?? g.x, y: host?.y ?? g.y, attachedTo: g.attachedTo };
        }),
      selected,
      generalSelected: generalSelected || selected.has(9000 + actor),
      ghosts: proj.ghosts,
      lines: proj.lines,
      fx,
      ghostUnits,
      selectBox: drag.kind === "box" ? drag : undefined,
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  startPhase("command", 0);
  return root;
}

type BattleFxLocal = {
  kind: SceneFx["kind"];
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  at: number;
};
