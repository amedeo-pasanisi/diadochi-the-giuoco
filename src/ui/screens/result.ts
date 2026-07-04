import { el } from "../dom";
import { applyMeander } from "../art/ornaments";
import { GENERAL_DEFS } from "../../engine/data/generals";
import { armyIntactFraction, liveUnits, type BattleState } from "../../engine/battle/state";

/** §4.5.2 — the battle is over: verdict and ledger. */
export function resultScreen(state: BattleState, onNext: () => void): HTMLElement {
  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);

  const title = state.draw
    ? "A Bitter Draw"
    : `Victory — Player ${(state.winner ?? 0) + 1}`;

  const ptolemy = state.events.find((e) => e.kind === "ptolemy");

  const panel = el("div", { class: "papyrus-panel result-panel" });
  panel.append(el("h3", {}, title), el("p", { class: "result-reason" }, state.finishReason));
  if (ptolemy) panel.append(el("p", { class: "result-doom" }, ptolemy.text));

  const table = el("div", { class: "result-table" });
  table.append(
    el("span", { class: "rt-h" }, ""),
    el("span", { class: "rt-h" }, "Player 1"),
    el("span", { class: "rt-h" }, "Player 2"),
  );
  const rows: [string, (p: 0 | 1) => string][] = [
    ["General", (p) => GENERAL_DEFS[state.musters[p].general!].name],
    ["Units standing", (p) => String(liveUnits(state, p).filter((u) => u.status !== "routing").length)],
    ["Units destroyed", (p) => String(state.stats[1 - p as 0 | 1].unitsDestroyed)],
    ["Units routed", (p) => String(state.stats[(1 - p) as 0 | 1].unitsRouted)],
    ["Casualty levels dealt", (p) => String(state.stats[p].casualtiesInflicted)],
    ["Army intact", (p) => `${Math.round(armyIntactFraction(state, p) * 100)}%`],
  ];
  for (const [label, fn] of rows) {
    table.append(
      el("span", { class: "rt-l" }, label),
      el("span", {}, fn(0)),
      el("span", {}, fn(1)),
    );
  }
  panel.append(table, el("p", { class: "result-turns" }, `${state.turn - 1} turns of battle.`));

  const next = el("button", { class: "btn-marble" }, "On to the Next One");
  next.addEventListener("click", onNext);

  const body = el("div", { class: "center-stage" }, panel, next);
  return el("div", { class: "screen" }, top, el("div", { class: "screen-body" }, body), bottom);
}
