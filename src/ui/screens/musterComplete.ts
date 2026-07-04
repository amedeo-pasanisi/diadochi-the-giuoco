import { el } from "../dom";
import { applyMeander } from "../art/ornaments";
import type { PlayerId } from "../../engine/types";
import { UNIT_DEFS, UNIT_ORDER } from "../../engine/data/units";
import { GENERAL_DEFS } from "../../engine/data/generals";
import { totalSpent, unitCount, type SelectionState } from "../../engine/recruitment";

/**
 * End of Milestone I: both armies mustered (or a walkover).
 * Replaced by the battlefield selection screen in Milestone II.
 */
export function musterCompleteScreen(
  armies: [SelectionState | null, SelectionState | null],
  onRestart: () => void,
): HTMLElement {
  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);

  const panel = el("div", { class: "papyrus-panel" });
  const defeated: PlayerId[] = [];
  if (!armies[0]) defeated.push(0);
  if (!armies[1]) defeated.push(1);

  if (defeated.length === 2) {
    panel.append(
      el("h3", {}, "The war fizzles"),
      el("p", {}, "Neither army took the field. The chroniclers record nothing but embarrassment."),
    );
  } else if (defeated.length === 1) {
    const loser = defeated[0]!;
    const winner = (1 - loser) as PlayerId;
    panel.append(
      el("h3", {}, `Player ${winner + 1} triumphs without a blow`),
      el(
        "p",
        {},
        `Player ${loser + 1} never mustered a single unit before the sand ran out. ` +
          `Automatic defeat — the throne watches, and it remembers.`,
      ),
    );
  } else {
    panel.append(el("h3", {}, "The armies are mustered"));
    const cols = el("div", { style: "display:flex; gap:40px; justify-content:center;" });
    armies.forEach((army, i) => {
      if (!army) return;
      const list = el("div", {});
      list.append(el("p", { style: "font-weight:bold; margin-bottom:6px;" }, `Player ${i + 1}`));
      if (army.general) {
        const g = GENERAL_DEFS[army.general];
        list.append(el("p", {}, `⚑ ${g.name} ${g.epithet}`));
      }
      for (const id of UNIT_ORDER) {
        const n = unitCount(army, id);
        if (n > 0) list.append(el("p", {}, `${UNIT_DEFS[id].name} ×${n}`));
      }
      list.append(
        el("p", { style: "margin-top:6px; font-style:italic;" }, `${totalSpent(army)} talents committed`),
      );
      cols.append(list);
    });
    panel.append(
      cols,
      el(
        "p",
        { style: "margin-top:16px; text-align:center; font-style:italic;" },
        "Next: the choice of battlefield — arriving with Milestone II.",
      ),
    );
  }

  const again = el("button", { class: "btn-marble" }, "Back to the Title");
  again.addEventListener("click", onRestart);

  const body = el("div", { class: "center-stage" }, panel, again);
  return el("div", { class: "screen" }, top, el("div", { class: "screen-body" }, body), bottom);
}
