import "./ui/theme.css";
import { clear } from "./ui/dom";
import { titleScreen } from "./ui/screens/title";
import { handoffScreen } from "./ui/screens/handoff";
import { armySelectScreen } from "./ui/screens/armySelect";
import { musterCompleteScreen } from "./ui/screens/musterComplete";
import type { SelectionState } from "./engine/recruitment";

/**
 * Hotseat match flow. Kept as a simple explicit sequence for now; the
 * "seat" boundary (who is allowed to act, and when) is the same one a
 * future network or AI opponent will plug into.
 */

const app = document.getElementById("app")!;

function showScreen(screen: HTMLElement): void {
  clear(app as HTMLElement);
  app.appendChild(screen);
}

function startMatch(): void {
  const armies: [SelectionState | null, SelectionState | null] = [null, null];

  showScreen(
    handoffScreen(0, "Muster your army. Your rival must look away.", () => {
      showScreen(
        armySelectScreen(0, (r1) => {
          armies[0] = r1.selection;
          showScreen(
            handoffScreen(1, "Muster your army. Your rival must look away.", () => {
              showScreen(
                armySelectScreen(1, (r2) => {
                  armies[1] = r2.selection;
                  showScreen(musterCompleteScreen(armies, showTitle));
                }),
              );
            }),
          );
        }),
      );
    }),
  );
}

function showTitle(): void {
  showScreen(titleScreen(startMatch));
}

showTitle();
