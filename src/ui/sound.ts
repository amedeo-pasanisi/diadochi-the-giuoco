/**
 * Placeholder sounds, synthesized with WebAudio so there are no asset
 * files to license. The Unity build (and later web polish) swaps these
 * for recorded samples — keep every call site going through this module.
 */

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null; // no audio device / autoplay refusal — stay silent
  }
}

interface ToneOpts {
  glideTo?: number;
  delay?: number;
  type?: OscillatorType;
}

function tone(freq: number, dur: number, vol: number, opts: ToneOpts = {}): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Small UI interactions: arrows, handoff buttons. */
export function uiClick(): void {
  tone(660, 0.06, 0.05, { type: "square" });
}

/** A unit recruited — silver on the table. */
export function coinClink(): void {
  tone(2489, 0.15, 0.09);
  tone(3729, 0.11, 0.05, { delay: 0.012 });
}

/** A unit dismissed back to the depot. */
export function dismissThud(): void {
  tone(220, 0.13, 0.12, { type: "triangle", glideTo: 130 });
}

/** Refusal — empty purse or full ranks. */
export function denyKnock(): void {
  tone(120, 0.08, 0.08, { type: "square" });
}

/** The salpinx sounds: armies march. */
export function marchHorn(): void {
  tone(233, 0.6, 0.09, { type: "sawtooth", glideTo: 185 });
  tone(466, 0.45, 0.035, { type: "sawtooth", glideTo: 370, delay: 0.02 });
}

/** Knucklebones on marble — the contest die (§2.1). */
export function diceRattle(): void {
  for (const [f, d] of [
    [1050, 0],
    [780, 0.07],
    [1180, 0.13],
    [640, 0.2],
  ] as const) {
    tone(f, 0.045, 0.07, { type: "square", delay: d });
  }
  tone(300, 0.16, 0.09, { type: "triangle", glideTo: 180, delay: 0.27 });
}

/** War cry for the deployment "Alalai!" button (§3.7) — used in Milestone III. */
export function alalai(): void {
  // massed-voices approximation: detuned saws swelling then cut off
  for (const f of [180, 196, 210, 240]) {
    tone(f, 0.7, 0.05, { type: "sawtooth", glideTo: f * 1.3 });
  }
  tone(587, 0.5, 0.05, { type: "square", glideTo: 700, delay: 0.1 });
}
