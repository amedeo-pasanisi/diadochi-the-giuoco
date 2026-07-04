import { el, fromHTML } from "../dom";
import { applyMeander } from "../art/ornaments";
import { coinSVG } from "../art/coinArt";
import { diceRattle, uiClick } from "../sound";
import type { ContestResult } from "../../engine/battlefield";
import type { SelectionState } from "../../engine/recruitment";
import { GENERAL_DEFS } from "../../engine/data/generals";

/**
 * §2.1 — show WHY one player gets to choose the ground: each side's
 * better of Command/Brilliancy, the die, the total, and the tiebreak.
 */
export function contestScreen(
  armies: [SelectionState, SelectionState],
  result: ContestResult,
  onContinue: () => void,
): HTMLElement {
  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);

  const cols = el("div", { class: "contest-cols" });
  for (const side of result.sides) {
    const g = GENERAL_DEFS[armies[side.player].general!];
    const isWinner = result.chooser === side.player;
    const statLine = el(
      "div",
      { class: "contest-stats" },
      el(
        "span",
        { class: side.usedStat === "command" ? "is-used" : "" },
        `Command ${g.command}`,
      ),
      el("span", { class: "sep" }, "·"),
      el(
        "span",
        { class: side.usedStat === "brilliancy" ? "is-used" : "" },
        `Brilliancy ${g.brilliancy}`,
      ),
    );
    cols.append(
      el(
        "div",
        { class: `contest-side${isWinner ? " is-winner" : ""}` },
        el("div", { class: "player-sub" }, `Player ${side.player + 1}`),
        el("div", { class: "coin-wrap" }, fromHTML(coinSVG(g, 148))),
        el("div", { class: "g-name" }, g.name),
        statLine,
        el(
          "div",
          { class: "contest-math" },
          el("span", { class: "contest-base" }, String(side.base)),
          el("span", { class: "sep" }, "+"),
          fromHTML(dieFace(side.die)),
          el("span", { class: "sep" }, "="),
          el("span", { class: "contest-total" }, String(side.total)),
        ),
        el("div", { class: "contest-spent" }, `${side.spent} talents committed`),
      ),
    );
  }

  const winner = result.sides.find((s) => s.player === result.chooser)!;
  const verdictBits: string[] = [];
  if (result.rerolls > 0)
    verdictBits.push(
      `The dice matched ${result.rerolls === 1 ? "once" : `${result.rerolls} times`} — the gods demanded a rethrow.`,
    );
  if (result.decidedBy === "spent")
    verdictBits.push(
      `The totals tied, so the leaner purse prevails: ${winner.general} spent less and takes the choice.`,
    );
  else
    verdictBits.push(
      `${winner.general} reads the land the sharper — the choice of ground is his.`,
    );

  const verdict = el(
    "div",
    { class: "papyrus-panel contest-verdict" },
    el("p", {}, verdictBits.join(" ")),
  );

  const proceed = el("button", { class: "btn-marble" }, `Let ${winner.general} Survey the Ground`);
  proceed.addEventListener("click", () => {
    uiClick();
    onContinue();
  });

  const body = el(
    "div",
    { class: "center-stage" },
    el("div", { class: "title-major", style: "font-size:26px" }, "The Choice of Ground"),
    el(
      "div",
      { class: "subtitle-line" },
      "the better of command and brilliancy, plus the throw of a die",
    ),
    cols,
    verdict,
    proceed,
  );

  diceRattle();
  return el("div", { class: "screen" }, top, el("div", { class: "screen-body" }, body), bottom);
}

/** A marble die face with pips. */
function dieFace(n: number): string {
  const pip = (x: number, y: number): string => `<circle cx="${x}" cy="${y}" r="4.6" fill="#40301c"/>`;
  const C = 23;
  const L = 12.5;
  const H = 33.5;
  const layout: Record<number, [number, number][]> = {
    1: [[C, C]],
    2: [[L, H], [H, L]],
    3: [[L, H], [C, C], [H, L]],
    4: [[L, L], [H, L], [L, H], [H, H]],
    5: [[L, L], [H, L], [C, C], [L, H], [H, H]],
    6: [[L, L], [H, L], [L, C], [H, C], [L, H], [H, H]],
  };
  return `<svg width="46" height="46" viewBox="0 0 46 46" class="die-face">
    <defs><linearGradient id="dm${n}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ece5d4"/><stop offset="1" stop-color="#bfb49a"/>
    </linearGradient></defs>
    <rect x="1.5" y="1.5" width="43" height="43" rx="7" fill="url(#dm${n})" stroke="#8d8066" stroke-width="1.6"/>
    ${(layout[n] ?? []).map(([x, y]) => pip(x, y)).join("")}
  </svg>`;
}
