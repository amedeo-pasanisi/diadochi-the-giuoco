import { el, fromHTML } from "../dom";
import { renderMapSVG } from "../art/mapArt";
import { createTimer } from "../components/timer";
import { marchHorn, uiClick } from "../sound";
import type { PlayerId } from "../../engine/types";
import {
  BATTLEFIELD_ORDER,
  BATTLEFIELDS,
  type BattlefieldId,
} from "../../engine/battlefield";
import { BATTLEFIELD_SELECT_SECONDS } from "../../engine/recruitment";

/**
 * §2.4 — the three battlefields on papyrus squares. Rendered as a
 * panel (not a full screen): the ground screen crossfades to it after
 * the dice have decided who chooses.
 */
export function battlefieldChoicePanel(
  chooser: PlayerId,
  onDone: (id: BattlefieldId) => void,
): HTMLElement {
  let selected: BattlefieldId | null = null;
  let finished = false;

  const finish = (id: BattlefieldId): void => {
    if (finished) return;
    finished = true;
    timer.stop();
    onDone(id);
  };

  const timer = createTimer(BATTLEFIELD_SELECT_SECONDS, () => {
    // Expiry (when timers are enforced): march for the chosen field, or
    // the open plain of Gaugamela if the player never picked (gap-fill).
    finish(selected ?? "gaugamela");
  });

  const header = el(
    "div",
    { class: "select-header" },
    el(
      "div",
      {},
      el("div", { class: "player-title" }, `Player ${chooser + 1} — Choose the battlefield`),
      el("div", { class: "player-sub" }, "winner of the ground · click a map, then deploy"),
    ),
    timer.element,
  );

  const deployBtn = el("button", { class: "btn-marble" }, "Deploy Army") as HTMLButtonElement;
  deployBtn.disabled = true;
  deployBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (selected === null) return;
    marchHorn();
    finish(selected);
  });

  const cards: Partial<Record<BattlefieldId, HTMLElement>> = {};
  const row = el("div", { class: "battlefield-row" });
  for (const id of BATTLEFIELD_ORDER) {
    const def = BATTLEFIELDS[id];
    const card = el(
      "div",
      { class: "battlefield-card papyrus-panel" },
      el("h3", {}, def.name),
      el("div", { class: "battlefield-map" }, fromHTML(renderMapSVG(def))),
      el("p", { class: "battlefield-blurb" }, def.blurb),
    );
    card.addEventListener("click", (ev) => {
      ev.stopPropagation();
      selected = id;
      uiClick();
      for (const [cid, c] of Object.entries(cards)) {
        c.classList.toggle("is-selected", cid === id);
      }
      deployBtn.disabled = false;
    });
    cards[id] = card;
    row.appendChild(card);
  }

  const footer = el("div", { class: "battlefield-footer" }, deployBtn);
  return el("div", { class: "ground-phase ground-choice" }, header, row, footer);
}
