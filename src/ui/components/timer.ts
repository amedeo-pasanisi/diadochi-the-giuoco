import { el } from "../dom";

export interface PhaseTimer {
  element: HTMLElement;
  stop(): void;
}

/**
 * Countdown pill (§1.9 etc.). Calls `onExpire` exactly once, unless
 * stopped first. Turns urgent below 30 seconds.
 */
export function createTimer(seconds: number, onExpire: () => void): PhaseTimer {
  const label = el("span", {}, format(seconds));
  const pill = el(
    "div",
    { class: "hud-pill timer-pill" },
    el("span", { class: "pill-label" }, "Time"),
    label,
  );

  const deadline = performance.now() + seconds * 1000;
  let handle = 0;
  let done = false;

  const tick = (): void => {
    const left = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    label.textContent = format(left);
    if (left <= 30) pill.classList.add("is-urgent");
    if (left <= 0 && !done) {
      done = true;
      window.clearInterval(handle);
      onExpire();
      return;
    }
  };
  handle = window.setInterval(tick, 250);

  return {
    element: pill,
    stop() {
      done = true;
      window.clearInterval(handle);
    },
  };
}

function format(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
