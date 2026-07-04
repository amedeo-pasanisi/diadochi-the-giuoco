/** Dev-only art preview: /preview.html renders every card art large. */
import { UNIT_DEFS, UNIT_ORDER } from "./engine/data/units";
import { unitArtSVG } from "./ui/art/unitArt";

for (const id of UNIT_ORDER) {
  const def = UNIT_DEFS[id];
  const div = document.createElement("div");
  div.className = "c";
  div.innerHTML = `<h5>${def.name}</h5>${unitArtSVG(def)}`;
  document.body.appendChild(div);
}
