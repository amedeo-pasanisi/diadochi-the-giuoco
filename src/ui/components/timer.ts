import { el } from "../dom";
import { ENFORCE_TIMERS } from "../../config";

export interface PhaseTimer {
  element: HTMLElement;
  stop(): void;
}

export interface TimerOpts {
  /**
   * Presentational timers pace the UI itself (e.g. the dice screen has
   * no button, so its countdown MUST advance the flow). They fire even
   * while ENFORCE_TIMERS is off.
   */
  presentational?: boolean;
}

/**
 * Countdown pill (§1.9 etc.). Calls `onExpire` exactly once, unless
 * stopped first. Turns urgent below 30 seconds. While ENFORCE_TIMERS
 * is off (development), expiry just dims the pill and does nothing —
 * unless the timer is presentational.
 */
export function createTimer(seconds: number, onExpire: () => void, opts: TimerOpts = {}): PhaseTimer {
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
      if (ENFORCE_TIMERS || opts.presentational) {
        onExpire();
      } else {
        pill.classList.remove("is-urgent");
        pill.classList.add("is-expired");
        pill.title = "Timers are lenient during development (config.ts → ENFORCE_TIMERS)";
      }
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
