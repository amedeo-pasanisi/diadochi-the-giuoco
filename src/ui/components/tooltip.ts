import type { GeneralDef, UnitDef } from "../../engine/types";
import { unitCap } from "../../engine/recruitment";

/** Singleton papyrus tooltip that follows the cursor (§1.1). */

let node: HTMLDivElement | null = null;

function ensure(): HTMLDivElement {
  if (!node) {
    node = document.createElement("div");
    node.className = "tooltip";
    node.style.display = "none";
    document.body.appendChild(node);
  }
  return node;
}

function place(x: number, y: number): void {
  const tt = ensure();
  const pad = 16;
  const rect = tt.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + rect.width > window.innerWidth - 8) left = x - rect.width - pad;
  if (top + rect.height > window.innerHeight - 8) top = y - rect.height - pad;
  tt.style.left = `${Math.max(4, left)}px`;
  tt.style.top = `${Math.max(4, top)}px`;
}

function show(html: string, ev: MouseEvent): void {
  const tt = ensure();
  tt.innerHTML = html;
  tt.style.display = "block";
  place(ev.clientX, ev.clientY);
}

export function hideTooltip(): void {
  if (node) node.style.display = "none";
}

/** Wire hover tooltips onto an element. */
export function attachTooltip(target: HTMLElement, html: () => string): void {
  target.addEventListener("mouseenter", (ev) => show(html(), ev));
  target.addEventListener("mousemove", (ev) => place(ev.clientX, ev.clientY));
  target.addEventListener("mouseleave", hideTooltip);
}

export function unitTooltipHTML(def: UnitDef, note?: string): string {
  const chargePart = def.charge > 0 ? ` <span style="opacity:.75">+${def.charge} charge</span>` : "";
  const formPart = ` <span style="opacity:.75">+${def.formation} formation</span>`;
  const rangedRow = def.ranged
    ? `<div><b>Ranged</b> ${def.ranged.attack} · ${def.ranged.rangeM} m</div>`
    : "";
  const specials: string[] = [];
  const s = def.special;
  if (s?.pikeWall) specials.push("Pike wall: halves frontal charge bonuses; nullifies frontal cavalry charges.");
  if (s?.rangedBonusVsHeavy) specials.push(`+${s.rangedBonusVsHeavy} ranged attack vs heavy units.`);
  if (s?.chargeHalvedVsLight) specials.push("Charge halved vs light units.");
  if (s?.chargeHalvedVsElephants) specials.push("Charge halved vs other elephants.");
  if (s?.defenseVsCavalry) specials.push(`+${s.defenseVsCavalry} defense vs cavalry.`);
  if (s?.defenseVsRanged) specials.push(`${s.defenseVsRanged} defense vs ranged.`);
  if (s?.passesThroughEnemyLight) specials.push("Passes through enemy light units as if friendly.");
  if (s?.flatTerrainOnly) specials.push("Moves only on flat, unencumbered ground.");
  if (s?.tramplesAlliesOnRout) specials.push("If routed, tramples allied units it passes through.");
  if (def.ranged && def.ranged.friendlyFirePenalty !== 0.5)
    specials.push(`Friendly units in the line of fire cost only ${def.ranged.friendlyFirePenalty * 100}% attack.`);

  return `
    <h4>${def.name}</h4>
    <div class="tt-epithet">${def.epithet}</div>
    <div class="tt-role">${def.role}</div>
    <div class="tt-stats">
      <div><b>Attack</b> ${def.attack}${chargePart}</div>
      <div><b>Defense</b> ${def.defense}${formPart}</div>
      <div><b>Training</b> ${def.training}</div>
      <div><b>Speed</b> ${def.speed}</div>
      <div><b>Endurance</b> ${def.endurance}</div>
      <div><b>Morale</b> ${def.morale}</div>
      ${rangedRow}
    </div>
    ${specials.length ? `<div class="tt-note">${specials.join("<br>")}</div>` : ""}
    <div class="tt-cost">Cost ${def.cost} talents · up to ${unitCap(def.id)} units${note ? `<br>${note}` : ""}</div>
  `;
}

export function generalTooltipHTML(g: GeneralDef): string {
  const duelNote = g.duelCharisma ? ` (counts as ${g.duelCharisma} in a duel)` : "";
  return `
    <h4>${g.name}</h4>
    <div class="tt-epithet">${g.epithet}</div>
    <div class="tt-role">${g.role}</div>
    <div class="tt-stats">
      <div><b>Command</b> ${g.command}</div>
      <div><b>Glance</b> ${g.glance}</div>
      <div><b>Brilliancy</b> ${g.brilliancy}</div>
      <div><b>Charisma</b> ${g.charisma}${duelNote}</div>
    </div>
    <div class="tt-cost">Cost ${g.cost} talents</div>
  `;
}
