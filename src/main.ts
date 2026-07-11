import "./ui/theme.css";
import { clear } from "./ui/dom";
import { titleScreen } from "./ui/screens/title";
import { handoffScreen } from "./ui/screens/handoff";
import { armySelectScreen } from "./ui/screens/armySelect";
import { groundScreen } from "./ui/screens/contest";
import { walkoverScreen } from "./ui/screens/walkover";
import { deployScreen } from "./ui/screens/deploy";
import { battleScreen } from "./ui/screens/battle";
import { resultScreen } from "./ui/screens/result";
import type { SelectionState } from "./engine/recruitment";
import { BATTLEFIELDS, battlefieldContest, type BattlefieldId } from "./engine/battlefield";
import type { DeploymentState } from "./engine/deployment";
import { createBattle } from "./engine/battle/state";
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
    groundScreen(match.armies, result, (id) => {
      match.battlefield = id;
      runDeployment(match);
    }),
  );
}

function runDeployment(match: Match): void {
  const def = BATTLEFIELDS[match.battlefield!];
  const deployments: [DeploymentState | null, DeploymentState | null] = [null, null];

  const phase = (player: 0 | 1, next: () => void): void => {
    showScreen(
      handoffScreen(player, "Deploy your army. Your rival must look away.", () => {
        showScreen(
          deployScreen(player, def, match.armies[player], (d) => {
            deployments[player] = d;
            next();
          }),
        );
      }),
    );
  };

  phase(0, () =>
    phase(1, () => {
      const battle = createBattle(def, match.armies, [deployments[0]!, deployments[1]!]);
      showScreen(
        battleScreen(battle, match.rng, (finalState) => {
          showScreen(resultScreen(finalState, startMatch));
        }),
      );
    }),
  );
}

function showTitle(): void {
  showScreen(titleScreen(startMatch));
}

showTitle();
