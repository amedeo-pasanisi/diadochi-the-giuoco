import { clear, el, fromHTML } from "../dom";
import { applyMeander } from "../art/ornaments";
import { unitArtSVG } from "../art/unitArt";
import { coinSVG } from "../art/coinArt";
import { createTimer } from "../components/timer";
import {
  attachTooltip,
  generalTooltipHTML,
  hideTooltip,
  unitTooltipHTML,
} from "../components/tooltip";
import type { PlayerId } from "../../engine/types";
import { UNIT_DEFS, UNIT_ORDER } from "../../engine/data/units";
import { GENERAL_DEFS, GENERAL_ORDER } from "../../engine/data/generals";
import {
  applySelectionAction,
  armySize,
  ARMY_SELECT_SECONDS,
  canAddUnit,
  canSetGeneral,
  emptySelection,
  finalizeOnTimeout,
  INFLATION_AFTER,
  nextCopyCost,
  remainingTalents,
  type SelectionState,
  TALENT_BUDGET,
  totalSpent,
  unitCap,
  unitCount,
  unitSpend,
} from "../../engine/recruitment";

export interface ArmySelectResult {
  /** Null = timer expired with an empty muster: automatic defeat (§1.9). */
  selection: SelectionState | null;
}

/**
 * Army selection screen (§1). One instance per player; the hotseat
 * flow shows a handoff curtain in between.
 */
export function armySelectScreen(
  player: PlayerId,
  onDone: (result: ArmySelectResult) => void,
): HTMLElement {
  let sel = emptySelection();
  // Which general the coin carousel is showing (browsing ≠ appointing).
  let shownGeneral = 0;
  let finished = false;

  const finish = (result: ArmySelectResult): void => {
    if (finished) return;
    finished = true;
    timer.stop();
    hideTooltip();
    onDone(result);
  };

  const timer = createTimer(ARMY_SELECT_SECONDS, () => {
    finish({ selection: finalizeOnTimeout(sel) });
  });

  /* ---------- header ---------- */

  const header = el(
    "div",
    { class: "select-header" },
    el(
      "div",
      {},
      el("div", { class: "player-title" }, `Player ${player + 1} — Muster your army`),
      el("div", { class: "player-sub" }, `${TALENT_BUDGET} talents · choose units and a general`),
    ),
    timer.element,
  );

  /* ---------- roster (left) ---------- */

  const rosterGrid = el("div", { class: "roster-grid" });

  function renderRoster(): void {
    clear(rosterGrid);
    for (const id of UNIT_ORDER) {
      const def = UNIT_DEFS[id];
      const count = unitCount(sel, id);
      const next = nextCopyCost(sel, id);
      const blocked = !canAddUnit(sel, id);
      const inflated = next !== null && count >= INFLATION_AFTER;

      const card = el(
        "div",
        { class: `unit-card${blocked ? " is-blocked" : ""}` },
        el("div", { class: "unit-card-name" }, def.name),
        el("div", { class: "unit-card-art" }, fromHTML(unitArtSVG(def))),
        el(
          "div",
          { class: "unit-card-foot" },
          el(
            "span",
            { class: `unit-card-cost${inflated ? " is-inflated" : ""}` },
            next === null ? "max" : String(next),
          ),
          count > 0 ? el("span", { class: "unit-count-badge" }, `×${count}`) : el("span", {}, ""),
        ),
      );

      attachTooltip(card, () => {
        const capNote =
          count >= unitCap(id)
            ? "Recruitment cap reached."
            : inflated
              ? `Beyond ${INFLATION_AFTER} units the price rises 20% → ${next} talents each.`
              : undefined;
        return unitTooltipHTML(def, capNote);
      });

      card.addEventListener("click", () => {
        const before = sel;
        sel = applySelectionAction(sel, { type: "addUnit", unit: id });
        if (sel !== before) refresh();
      });

      rosterGrid.appendChild(card);
    }
  }

  const rosterPane = el(
    "div",
    { class: "pane" },
    el("div", { class: "title-section" }, "Unit Roster"),
    rosterGrid,
  );

  /* ---------- muster (middle) ---------- */

  const musterList = el("div", { class: "muster-list" });

  function renderMuster(): void {
    clear(musterList);
    const chosen = UNIT_ORDER.filter((id) => unitCount(sel, id) > 0);
    if (chosen.length === 0 && !sel.general) {
      musterList.appendChild(
        el("div", { class: "muster-empty" }, "No troops mustered. The campfires stay cold."),
      );
      return;
    }
    for (const id of chosen) {
      const def = UNIT_DEFS[id];
      const count = unitCount(sel, id);
      const row = el(
        "div",
        { class: "muster-row" },
        el("div", { class: "muster-art" }, fromHTML(unitArtSVG(def))),
        el("div", { class: "muster-name" }, def.name),
        el("div", { class: "muster-count" }, `×${count}`),
        el("div", { class: "muster-cost" }, `${unitSpend(id, count)} ᴛ`),
      );
      attachTooltip(row, () => unitTooltipHTML(def, "Click to dismiss one unit."));
      row.addEventListener("click", () => {
        sel = applySelectionAction(sel, { type: "removeUnit", unit: id });
        refresh();
      });
      musterList.appendChild(row);
    }
    if (sel.general) {
      const g = GENERAL_DEFS[sel.general];
      const row = el(
        "div",
        { class: "muster-row" },
        el("div", { class: "muster-name" }, `⚑ ${g.name}, commanding`),
        el("div", { class: "muster-cost" }, `${g.cost} ᴛ`),
      );
      attachTooltip(row, () => generalTooltipHTML(g));
      row.addEventListener("click", () => {
        sel = applySelectionAction(sel, { type: "setGeneral", general: null });
        refresh();
      });
      musterList.appendChild(row);
    }
  }

  const musterPane = el(
    "div",
    { class: "pane" },
    el("div", { class: "title-section" }, "Mustered Army"),
    musterList,
  );

  /* ---------- command column (right): general, budget, march ---------- */

  const coinWrap = el("div", { class: "coin-wrap" });
  const captionName = el("div", { class: "g-name" }, "");
  const captionState = el("div", { class: "g-state" }, "");
  const budgetPill = el("div", { class: "hud-pill" });
  const marchHint = el("div", { class: "march-hint" }, "");
  const marchBtn = el("button", { class: "btn-marble" }, "March to Battle") as HTMLButtonElement;

  const prevBtn = el("button", { class: "coin-arrow", title: "Previous general" }, "‹");
  const nextBtn = el("button", { class: "coin-arrow", title: "Next general" }, "›");
  prevBtn.addEventListener("click", () => {
    shownGeneral = (shownGeneral + GENERAL_ORDER.length - 1) % GENERAL_ORDER.length;
    refresh();
  });
  nextBtn.addEventListener("click", () => {
    shownGeneral = (shownGeneral + 1) % GENERAL_ORDER.length;
    refresh();
  });

  coinWrap.addEventListener("click", () => {
    const id = GENERAL_ORDER[shownGeneral]!;
    sel = applySelectionAction(sel, {
      type: "setGeneral",
      general: sel.general === id ? null : id,
    });
    refresh();
  });
  attachTooltip(coinWrap, () => generalTooltipHTML(GENERAL_DEFS[GENERAL_ORDER[shownGeneral]!]));

  function renderGeneral(): void {
    const id = GENERAL_ORDER[shownGeneral]!;
    const g = GENERAL_DEFS[id];
    clear(coinWrap);
    coinWrap.appendChild(fromHTML(coinSVG(g)));
    coinWrap.classList.toggle("is-chosen", sel.general === id);
    coinWrap.classList.toggle("is-unaffordable", !canSetGeneral(sel, id));
    captionName.textContent = g.name;
    if (sel.general === id) {
      captionState.textContent = "Commanding — click to dismiss";
      captionState.className = "g-state is-chosen";
    } else {
      captionState.textContent = canSetGeneral(sel, id)
        ? `${g.cost} talents — click to appoint`
        : `${g.cost} talents — beyond your purse`;
      captionState.className = "g-state";
    }
  }

  function renderBudget(): void {
    budgetPill.innerHTML = "";
    budgetPill.append(
      el("span", { class: "pill-label" }, "Treasury"),
      el("span", {}, `${remainingTalents(sel)} / ${TALENT_BUDGET} ᴛ`),
    );
  }

  function renderMarch(): void {
    const ready = armySize(sel) > 0 && sel.general !== null;
    marchBtn.disabled = !ready;
    marchHint.textContent =
      armySize(sel) === 0
        ? "Recruit at least one unit."
        : sel.general === null
          ? "Appoint a general — click his coin."
          : `${totalSpent(sel)} talents committed. The men await your word.`;
  }

  marchBtn.addEventListener("click", () => {
    if (marchBtn.disabled) return;
    finish({ selection: sel });
  });

  const commandPane = el(
    "div",
    { class: "pane" },
    el("div", { class: "title-section" }, "General Selection"),
    el("div", { class: "general-box" }, prevBtn, coinWrap, nextBtn),
    el("div", { class: "general-caption" }, captionName, captionState),
    el("div", { style: "flex:1" }),
    el("div", { class: "pane-footer" }, budgetPill, marchHint, marchBtn),
  );

  function refresh(): void {
    renderRoster();
    renderMuster();
    renderGeneral();
    renderBudget();
    renderMarch();
  }
  refresh();

  /* ---------- assemble ---------- */

  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);

  const columns = el("div", { class: "select-columns" }, rosterPane, musterPane, commandPane);

  return el(
    "div",
    { class: "screen" },
    top,
    el("div", { class: "screen-body" }, header, columns),
    bottom,
  );
}
