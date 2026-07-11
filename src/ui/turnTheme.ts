import type { PlayerId } from "../engine/types";

/**
 * The vase flips: while Player 1 (the white player) is acting, the
 * whole interface inverts — everything reddish turns black, everything
 * black turns reddish, like turning from red-figure to black-figure
 * pottery. Player 2's turn (and neutral moments) use the default
 * red-figure look. Driven by CSS variables on <body>.
 */
export function setTurnTheme(player: PlayerId | null): void {
  document.body.classList.toggle("theme-inverted", player === 0);
}

/** The colour of the void around the battlefield canvas, per theme. */
export function fieldBackdrop(player: PlayerId | null): string {
  return player === 0 ? "#96461f" : "#0d0a07";
}
