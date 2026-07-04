import { el, fromHTML } from "../dom";
import { applyMeander, laurelSVG } from "../art/ornaments";
import { marchHorn } from "../sound";

export function titleScreen(onStart: () => void): HTMLElement {
  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);

  const title = el("h1", { class: "title-major" }, "Wars of the Diadochi");
  title.style.fontSize = "52px";

  const start = el("button", { class: "btn-marble" }, "March to War");
  start.addEventListener("click", () => {
    marchHorn();
    onStart();
  });

  const body = el(
    "div",
    { class: "center-stage" },
    el("div", { class: "laurel-flourish" }, fromHTML(laurelSVG(340))),
    title,
    el("div", { class: "subtitle-line" }, "The empire is a corpse — carve your share"),
    start,
    el("div", { class: "subtitle-line" }, "Hotseat · two players · one machine"),
  );

  return el("div", { class: "screen" }, top, el("div", { class: "screen-body" }, body), bottom);
}
