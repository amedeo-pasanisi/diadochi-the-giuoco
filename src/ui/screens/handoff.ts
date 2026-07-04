import { el } from "../dom";
import { applyMeander } from "../art/ornaments";
import type { PlayerId } from "../../engine/types";

/**
 * Hotseat curtain between player turns — hides the previous player's
 * choices (§1.11, §3.8).
 */
export function handoffScreen(
  player: PlayerId,
  message: string,
  onReady: () => void,
): HTMLElement {
  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);

  const ready = el("button", { class: "btn-marble" }, `I am Player ${player + 1}`);
  ready.addEventListener("click", onReady);

  const body = el(
    "div",
    { class: "center-stage" },
    el("div", { class: "subtitle-line" }, "Pass the machine"),
    el("div", { class: "handoff-name" }, `Player ${player + 1}`),
    el("div", { class: "subtitle-line" }, message),
    ready,
  );

  return el("div", { class: "screen" }, top, el("div", { class: "screen-body" }, body), bottom);
}
