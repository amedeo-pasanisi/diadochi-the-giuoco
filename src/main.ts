import "./ui/theme.css";
import { clear } from "./ui/dom";
import { titleScreen } from "./ui/screens/title";
import { handoffScreen } from "./ui/screens/handoff";
import { armySelectScreen } from "./ui/screens/armySelect";
import { contestScreen } from "./ui/screens/contest";
import { battlefieldSelectScreen } from "./ui/screens/battlefieldSelect";
import { walkoverScreen } from "./ui/screens/walkover";
import { deployStubScreen } from "./ui/screens/deployStub";
import type { SelectionState } from "./engine/recruitment";
import { battlefieldContest, type BattlefieldId } from "./engine/battlefield";
import { randomSeed, Rng } from "./engine/rng";

/**
 * Hotseat match flow. Kept as a simple explicit sequence for now; the
 * "seat" boundary (who is allowed to act, and when) is the same one a
 * future network or AI opponent will plug into. Every random outcome
 * draws from one seeded Rng, so a match is reproducible from its seed.
 */

interface Match {
  seed: number;
  rng: Rng;
  armies: [SelectionState, SelectionState];
  battlefield?: BattlefieldId;
}

const app = document.getElementById("app")!;

function showScreen(screen: HTMLElement): void {
  clear(app as HTMLElement);
  app.appendChild(screen);
}

function startMatch(): void {
  const seed = randomSeed();
  const rng = new Rng(seed);
  const musters: [SelectionState | null, SelectionState | null] = [null, null];

  const musterPhase = (player: 0 | 1, next: () => void): void => {
    showScreen(
      handoffScreen(player, "Muster your army. Your rival must look away.", () => {
        showScreen(
          armySelectScreen(player, (r) => {
            musters[player] = r.selection;
            next();
          }),
        );
      }),
    );
  };

  musterPhase(0, () =>
    musterPhase(1, () => {
      if (!musters[0] || !musters[1]) {
        const loser = !musters[0] && !musters[1] ? null : !musters[0] ? 0 : 1;
        showScreen(walkoverScreen(loser, showTitle));
        return;
      }
      const match: Match = { seed, rng, armies: [musters[0], musters[1]] };
      runContest(match);
    }),
  );
}

function runContest(match: Match): void {
  const result = battlefieldContest(match.armies, match.rng);
  showScreen(
    contestScreen(match.armies, result, () => {
      showScreen(
        battlefieldSelectScreen(result.chooser, (id) => {
          match.battlefield = id;
          showScreen(deployStubScreen(id, showTitle));
        }),
      );
    }),
  );
}

function showTitle(): void {
  showScreen(titleScreen(startMatch));
}

showTitle();
