import { el } from "../dom";
import { applyMeander } from "../art/ornaments";
import type { PlayerId } from "../../engine/types";

/**
 * §1.9 — a player whose timer expired with an empty muster suffers an
 * automatic defeat. `loser === null` means both did.
 */
export function walkoverScreen(loser: PlayerId | null, onRestart: () => void): HTMLElement {
  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);

  const panel = el("div", { class: "papyrus-panel" });
  if (loser === null) {
    panel.append(
      el("h3", {}, "The war fizzles"),
      el("p", {}, "Neither army took the field. The chroniclers record nothing but embarrassment."),
    );
  } else {
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
  }

  const again = el("button", { class: "btn-marble" }, "Back to the Title");
  again.addEventListener("click", onRestart);

  const body = el("div", { class: "center-stage" }, panel, again);
  return el("div", { class: "screen" }, top, el("div", { class: "screen-body" }, body), bottom);
}
