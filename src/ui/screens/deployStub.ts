import { el, fromHTML } from "../dom";
import { applyMeander } from "../art/ornaments";
import { renderMapSVG } from "../art/mapArt";
import { BATTLEFIELDS, type BattlefieldId } from "../../engine/battlefield";

/** End of Milestone II — replaced by the deployment screen in Milestone III. */
export function deployStubScreen(battlefield: BattlefieldId, onRestart: () => void): HTMLElement {
  const def = BATTLEFIELDS[battlefield];
  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);

  const mapBox = el("div", { class: "battlefield-map deploy-stub-map" }, fromHTML(renderMapSVG(def)));

  const panel = el(
    "div",
    { class: "papyrus-panel" },
    el("h3", {}, `The armies march for ${def.name}`),
    mapBox,
    el(
      "p",
      { style: "margin-top:12px; text-align:center; font-style:italic;" },
      "Deployment and battle arrive with Milestone III.",
    ),
  );

  const back = el("button", { class: "btn-marble" }, "Back to the Title");
  back.addEventListener("click", onRestart);

  const body = el("div", { class: "center-stage" }, panel, back);
  return el("div", { class: "screen" }, top, el("div", { class: "screen-body" }, body), bottom);
}
