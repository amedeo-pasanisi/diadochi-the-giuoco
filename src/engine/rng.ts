/**
 * Deterministic seeded RNG (mulberry32). Every roll in a match flows
 * through one Rng instance, so a battle is fully reproducible from its
 * seed + order log — which is what makes lockstep network play and
 * replays possible later.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [1, sides]. */
  die(sides: number): number {
    return 1 + Math.floor(this.next() * sides);
  }

  d6(): number {
    return this.die(6);
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** D&D-style advantage: best of two rolls of `roll`. */
  advantage<T>(roll: (rng: Rng) => T, better: (a: T, b: T) => T): T {
    return better(roll(this), roll(this));
  }
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
