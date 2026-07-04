import { el, fromHTML } from "../dom";
import { applyMeander } from "../art/ornaments";
import { coinSVG } from "../art/coinArt";
import { diceRattle, uiClick } from "../sound";
import { battlefieldChoicePanel } from "./battlefieldSelect";
import type { BattlefieldId, ContestResult } from "../../engine/battlefield";
import type { SelectionState } from "../../engine/recruitment";
import { GENERAL_DEFS } from "../../engine/data/generals";

/** Dice flight time; totals/verdict reveal after the last die settles. */
const ROLL_MS = 1600;
const STAGGER_MS = 260;
/** How long the verdict lingers before the screen glides on by itself. */
const LINGER_MS = 3800;

/**
 * §2.1 — "The Choice of Ground", now a single self-advancing screen:
 * the dice tumble in 3D, the totals and verdict fade in, and after a
 * short countdown (or a click) the same screen crossfades into the
 * battlefield choice for the winner. No buttons.
 */
export function groundScreen(
  armies: [SelectionState, SelectionState],
  result: ContestResult,
  onDone: (id: BattlefieldId) => void,
): HTMLElement {
  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);

  /* ---------- phase A: the contest ---------- */

  const cols = el("div", { class: "contest-cols" });
  const dice: HTMLElement[] = [];
  for (const side of result.sides) {
    const g = GENERAL_DEFS[armies[side.player].general!];
    const isWinner = result.chooser === side.player;
    const die = die3D(side.die);
    dice.push(die);
    cols.append(
      el(
        "div",
        { class: `contest-side${isWinner ? " will-win" : ""}` },
        el("div", { class: "player-sub" }, `Player ${side.player + 1}`),
        el("div", { class: "coin-wrap" }, fromHTML(coinSVG(g, 148))),
        el("div", { class: "g-name" }, g.name),
        el(
          "div",
          { class: "contest-stats" },
          el("span", { class: side.usedStat === "command" ? "is-used" : "" }, `Command ${g.command}`),
          el("span", { class: "sep" }, "·"),
          el(
            "span",
            { class: side.usedStat === "brilliancy" ? "is-used" : "" },
            `Brilliancy ${g.brilliancy}`,
          ),
        ),
        el(
          "div",
          { class: "contest-math" },
          el("span", { class: "contest-base" }, String(side.base)),
          el("span", { class: "sep" }, "+"),
          die,
          el("span", { class: "sep reveal-late" }, "="),
          el("span", { class: "contest-total reveal-late" }, String(side.total)),
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
    verdictBits.push(`${winner.general} reads the land the sharper — the choice of ground is his.`);

  const verdict = el(
    "div",
    { class: "papyrus-panel contest-verdict reveal-late" },
    el("p", {}, verdictBits.join(" ")),
    el("p", { class: "contest-hint" }, `${winner.general} rides out to survey the ground…`),
  );

  const phaseA = el(
    "div",
    { class: "ground-phase contest-stage" },
    el(
      "div",
      { class: "select-header" },
      el(
        "div",
        {},
        el("div", { class: "player-title" }, "The Choice of Ground"),
        el(
          "div",
          { class: "player-sub" },
          "the better of command and brilliancy, plus the throw of a die",
        ),
      ),
    ),
    el("div", { class: "center-stage", style: "gap:22px" }, cols, verdict),
  );

  const body = el("div", { class: "screen-body ground-body" }, phaseA);
  const screen = el("div", { class: "screen" }, top, body, bottom);

  /* ---------- choreography ---------- */

  let revealed = false;
  let advanced = false;

  const advance = (): void => {
    if (advanced) return;
    advanced = true;
    phaseA.classList.add("phase-exit");
    window.setTimeout(() => {
      phaseA.remove();
      const choice = battlefieldChoicePanel(result.chooser, onDone);
      choice.classList.add("phase-pre");
      body.appendChild(choice);
      requestAnimationFrame(() => requestAnimationFrame(() => choice.classList.remove("phase-pre")));
    }, 520);
  };

  // click anywhere (once the verdict is up) to skip the wait
  screen.addEventListener("click", () => {
    if (revealed && !advanced) {
      uiClick();
      advance();
    }
  });

  // roll the dice once the screen is mounted
  window.setTimeout(() => {
    diceRattle();
    dice.forEach((die, i) => rollDie(die, i * STAGGER_MS, i === 0 ? -1 : 1));
    window.setTimeout(() => {
      revealed = true;
      screen.querySelectorAll(".reveal-late").forEach((n) => n.classList.add("is-revealed"));
      screen.querySelector(".will-win")?.classList.add("is-winner");
      // linger on the verdict, then glide into the battlefield choice
      window.setTimeout(advance, LINGER_MS);
    }, ROLL_MS + STAGGER_MS + 150);
  }, 350);

  return screen;
}

/* ---------- 3D die ---------- */

/** Opposite faces sum to seven, as the gods intend. */
const FACE_TRANSFORMS: [number, string][] = [
  [1, "translateZ(23px)"],
  [6, "rotateY(180deg) translateZ(23px)"],
  [2, "rotateY(90deg) translateZ(23px)"],
  [5, "rotateY(-90deg) translateZ(23px)"],
  [3, "rotateX(90deg) translateZ(23px)"],
  [4, "rotateX(-90deg) translateZ(23px)"],
];

/** Cube rotation that brings face `n` to front. */
const SHOW_FACE: Record<number, [number, number]> = {
  1: [0, 0],
  2: [0, -90],
  3: [-90, 0],
  4: [90, 0],
  5: [0, 90],
  6: [0, 180],
};

function die3D(value: number): HTMLElement {
  const cube = el("div", { class: "die3d" });
  for (const [n, tf] of FACE_TRANSFORMS) {
    const face = el("div", { class: "die3d-face" }, fromHTML(dieFaceSVG(n)));
    face.style.transform = tf;
    cube.appendChild(face);
  }
  const [rx, ry] = SHOW_FACE[value]!;
  cube.dataset["rx"] = String(rx);
  cube.dataset["ry"] = String(ry);
  cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  return el("div", { class: "die3d-wrap", style: "opacity:0" }, cube);
}

/** Tumble in from above with bounces, settling on the rolled face. */
function rollDie(wrap: HTMLElement, delay: number, dir: -1 | 1): void {
  const cube = wrap.firstElementChild as HTMLElement;
  const rx = Number(cube.dataset["rx"]);
  const ry = Number(cube.dataset["ry"]);

  wrap.animate(
    [
      { transform: `translate(${dir * -170}px, -210px) scale(1.8)`, opacity: 0, offset: 0 },
      { transform: `translate(${dir * -128}px, -130px) scale(1.62)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${dir * -52}px, 12px) scale(1.3)`, offset: 0.4 },
      { transform: `translate(${dir * -24}px, -40px) scale(1.18)`, offset: 0.56 },
      { transform: `translate(${dir * -6}px, 3px) scale(1.06)`, offset: 0.72 },
      { transform: `translate(${dir * 3}px, -12px) scale(1.02)`, offset: 0.85 },
      { transform: "translate(0, 0) scale(1)", opacity: 1, offset: 1 },
    ],
    { duration: ROLL_MS, delay, easing: "linear", fill: "both" },
  ).onfinish = () => {
    wrap.style.opacity = "1";
  };
  cube.animate(
    [
      {
        transform: `rotateX(${rx + dir * 1170}deg) rotateY(${ry + dir * 810}deg) rotateZ(${dir * 540}deg)`,
      },
      { transform: `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(0deg)` },
    ],
    { duration: ROLL_MS, delay, easing: "cubic-bezier(0.16, 0.72, 0.28, 1)", fill: "both" },
  );
}

/** A marble die face with pips. */
export function dieFaceSVG(n: number): string {
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
