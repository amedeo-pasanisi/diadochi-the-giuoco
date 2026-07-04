/**
 * Core shared types for the game engine.
 *
 * The engine layer is pure TypeScript with no DOM or rendering imports.
 * All state is plain serializable data and all mutations flow through
 * action objects, so the engine can later be driven by a network peer
 * or an AI, and ported to C# for the Unity build.
 */

export type PlayerId = 0 | 1;

export type UnitWeight = "light" | "medium" | "heavy";
export type UnitArm = "infantry" | "cavalry" | "special";
/** Shaft weapons are rendered as lines projecting from a unit's front on the map. */
export type ShaftKind = "pike" | "spear" | "none";

export type UnitId =
  | "pezhetairoi"
  | "hoplitai"
  | "hypaspistai"
  | "thureophoroi"
  | "peltastai"
  | "toxotai"
  | "sphendonetai"
  | "hetairoi"
  | "thessaloi"
  | "prodromoi"
  | "hippeis"
  | "tarantinoi"
  | "hippotoxotai"
  | "elephantes"
  | "drepanephoroi";

export type GeneralId = "seleukos" | "antigonos" | "ptolemaios" | "eumenes";

export interface RangedProfile {
  attack: number;
  /** Range in metres (doc ranges are given in 100 m units). */
  rangeM: number;
  /** Attack fraction lost when friendly units sit on the line of fire (0.5 default, 0.25 for Toxotai). */
  friendlyFirePenalty: number;
}

/** Rule exceptions, kept as data flags so battle code stays table-driven. */
export interface UnitSpecialRules {
  /** Pezhetairoi: formation halves enemy charge bonus frontally, nullifies it for cavalry charges. */
  pikeWall?: boolean;
  /** Sphendonetai: ranged attack bonus vs heavy units. */
  rangedBonusVsHeavy?: number;
  /** Elephantes / Drepanephoroi: charge bonus halved vs light units. */
  chargeHalvedVsLight?: boolean;
  /** Elephantes: charge bonus halved vs other elephants. */
  chargeHalvedVsElephants?: boolean;
  /** Elephantes: defense modifier vs cavalry (+3). */
  defenseVsCavalry?: number;
  /** Elephantes: defense modifier vs ranged attacks (-1). */
  defenseVsRanged?: number;
  /** Elephantes / Drepanephoroi: attack allied units they pass through while routing. */
  tramplesAlliesOnRout?: boolean;
  /** Drepanephoroi: pass through enemy light units as if friendly. */
  passesThroughEnemyLight?: boolean;
  /** Drepanephoroi: may only move on flat, unencumbered terrain. */
  flatTerrainOnly?: boolean;
}

export interface UnitDef {
  id: UnitId;
  /** Greek transliteration, e.g. "Pezhetairoi". */
  name: string;
  /** English gloss + class, e.g. "Foot Companions — heavy pike infantry". */
  epithet: string;
  /** One-two line battlefield role, shown in the tooltip. */
  role: string;
  cost: number;
  /** Per-army cap override; global cap is 8. */
  max?: number;
  weight: UnitWeight;
  arm: UnitArm;
  elite?: boolean;
  shaft: ShaftKind;
  /** Which attack the unit uses by default; Shift-orders use the other one. */
  primary: "melee" | "ranged";
  attack: number;
  charge: number;
  defense: number;
  formation: number;
  training: number;
  speed: number;
  endurance: number;
  morale: number;
  ranged?: RangedProfile;
  special?: UnitSpecialRules;
}

export interface GeneralDef {
  id: GeneralId;
  name: string;
  epithet: string;
  role: string;
  cost: number;
  command: number;
  glance: number;
  brilliancy: number;
  charisma: number;
  /** Eumenes: charisma counts as this value in a duel. */
  duelCharisma?: number;
  /** Ptolemaios. When he is about to win, the gods intervene. */
  doomed?: boolean;
}
