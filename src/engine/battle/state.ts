import type { GeneralId, PlayerId, UnitId } from "../types";
import { UNIT_DEFS } from "../data/units";
import { GENERAL_DEFS } from "../data/generals";
import type { BattlefieldDef, TerrainSample } from "../battlefield";
import { CAMPS, MAP_SIZE_M, terrainAt } from "../battlefield";
import { totalSpent, unitSpend, type SelectionState } from "../recruitment";
import type { DeploymentState } from "../deployment";
import type { FieldUnit } from "../field";
import { GLANCE_RADIUS, type Order } from "./orders";

/* ============================================================
   Battle state (§4). Everything is plain data + pure helpers;
   the resolver in resolve.ts is the only thing that mutates it.
   ============================================================ */

export type UnitStatus = "normal" | "routing" | "pursuing" | "sacking";

export interface BattleUnit extends FieldUnit {
  /** Continuous fatigue gauge actually spent (§4.3.3), 0..endurance. */
  fatigueSpent: number;
  status: UnitStatus;
  order: Order | null;
  /** Wait-order recovery bank, in percent (§4.3.8). */
  waitBank: number;
  /** uids of enemies this unit is in contact with. */
  engaged: number[];
  /** Set when a 4th fatigue level would land: skip next phase (§4.3.6). */
  restingForced: boolean;
  /** Rout bookkeeping (§4.3.7). */
  routGoal: "camp" | "edge" | null;
  pursuitTarget: number | null;
  /** Elevation levels climbed during the last move (charge penalty §4.3.4). */
  lastClimb: number;
  /** Terrain currently underfoot (sampled at centre each resolution). */
  terrain: TerrainSample;
  removed: boolean;
  fled: boolean;
}

export interface BattleGeneral {
  player: PlayerId;
  general: GeneralId;
  x: number;
  y: number;
  attachedTo: number | null;
  /** dead | fled-the-field (halved stats) | in the fight */
  condition: "fighting" | "fled" | "dead";
  /** Set when he spends the turn rallying (§4.4). */
  rallying: boolean;
  /** His own escort unit's uid while independent (fights as Hetairoi). */
  unitUid: number;
}

export interface BattleEvent {
  kind:
    | "rout"
    | "rally"
    | "pursuit"
    | "destroyed"
    | "general-death"
    | "general-fled"
    | "duel"
    | "sack"
    | "ptolemy"
    | "victory"
    | "info";
  text: string;
}

/** Transient combat effects for the playback animation. */
export interface BattleFx {
  kind: "shoot" | "clash" | "casualty" | "morale" | "disorder" | "rout";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  /** 0..1 fraction of the playback at which it fires. */
  at: number;
}

export interface SideStats {
  casualtiesInflicted: number;
  unitsDestroyed: number;
  unitsRouted: number;
}

export interface BattleState {
  def: BattlefieldDef;
  turn: number; // 1..30
  units: BattleUnit[];
  generals: [BattleGeneral, BattleGeneral];
  musters: [SelectionState, SelectionState];
  /** Persistent morale penalties: camp sacked (§4.5.1.2). */
  campSacked: [boolean, boolean];
  /** Scheduled army-wide morale check after a general falls (§4.5.1.1). */
  generalFallenCheck: [boolean, boolean];
  events: BattleEvent[];
  /** Cleared each Battle Phase: visual effects + calculation log. */
  fx: BattleFx[];
  log: string[];
  stats: [SideStats, SideStats];
  winner: PlayerId | null;
  draw: boolean;
  finished: boolean;
  finishReason: string;
}

/* ---------- setup ---------- */

export function createBattle(
  def: BattlefieldDef,
  musters: [SelectionState, SelectionState],
  deployments: [DeploymentState, DeploymentState],
): BattleState {
  const units: BattleUnit[] = [];
  const generals: BattleGeneral[] = [];

  deployments.forEach((dep, p) => {
    for (const u of dep.units) {
      units.push(toBattleUnit(def, u));
    }
    const gid = musters[p as PlayerId]!.general!;
    // §3.4 — the general's own unit fights with the Hetairoi profile.
    const escortUid = 9000 + p;
    if (dep.general.attachedTo === null) {
      const escort: FieldUnit = {
        uid: escortUid,
        unit: "hetairoi",
        player: p as PlayerId,
        x: dep.general.x,
        y: dep.general.y,
        angle: p === 0 ? 0 : Math.PI,
        morale: 3,
        fatigue: 0,
        disorder: 0,
        casualties: 0,
      };
      units.push(toBattleUnit(def, escort));
    }
    generals.push({
      player: p as PlayerId,
      general: gid,
      x: dep.general.x,
      y: dep.general.y,
      attachedTo: dep.general.attachedTo,
      condition: "fighting",
      rallying: false,
      unitUid: dep.general.attachedTo === null ? escortUid : -1,
    });
  });

  return {
    def,
    turn: 1,
    units,
    generals: [generals[0]!, generals[1]!],
    musters,
    campSacked: [false, false],
    generalFallenCheck: [false, false],
    events: [],
    fx: [],
    log: [],
    stats: [
      { casualtiesInflicted: 0, unitsDestroyed: 0, unitsRouted: 0 },
      { casualtiesInflicted: 0, unitsDestroyed: 0, unitsRouted: 0 },
    ],
    winner: null,
    draw: false,
    finished: false,
    finishReason: "",
  };
}

function toBattleUnit(def: BattlefieldDef, u: FieldUnit): BattleUnit {
  return {
    ...u,
    fatigueSpent: 0,
    status: "normal",
    order: null,
    waitBank: 0,
    engaged: [],
    restingForced: false,
    routGoal: null,
    pursuitTarget: null,
    lastClimb: 0,
    terrain: terrainAt(def, u.x, u.y),
    removed: false,
    fled: false,
  };
}

/* ---------- lookups ---------- */

export function liveUnits(s: BattleState, player?: PlayerId): BattleUnit[] {
  return s.units.filter(
    (u) => !u.removed && !u.fled && (player === undefined || u.player === player),
  );
}

export function unitByUid(s: BattleState, uid: number): BattleUnit | undefined {
  return s.units.find((u) => u.uid === uid);
}

export function generalOf(s: BattleState, player: PlayerId): BattleGeneral {
  return s.generals[player];
}

export function generalPosition(s: BattleState, g: BattleGeneral): [number, number] {
  const host = g.attachedTo !== null ? unitByUid(s, g.attachedTo) : unitByUid(s, g.unitUid);
  return host && !host.removed && !host.fled ? [host.x, host.y] : [g.x, g.y];
}

export function isGeneralUnit(s: BattleState, u: BattleUnit): BattleGeneral | null {
  for (const g of s.generals) {
    if (g.unitUid === u.uid || g.attachedTo === u.uid) return g;
  }
  return null;
}

export function withinGlance(s: BattleState, u: BattleUnit): boolean {
  const g = generalOf(s, u.player);
  if (g.condition === "dead") return false;
  const [gx, gy] = generalPosition(s, g);
  return Math.hypot(u.x - gx, u.y - gy) <= GLANCE_RADIUS;
}

/* ---------- levels (§4.3.6) ---------- */

export function fatigueLevels(u: BattleUnit): number {
  const end = enduranceOf(u);
  if (end <= 0) return 3;
  const frac = u.fatigueSpent / end;
  if (frac >= 0.75) return 3;
  if (frac >= 0.5) return 2;
  if (frac >= 0.25) return 1;
  return 0;
}

export function enduranceOf(u: BattleUnit): number {
  return UNIT_DEFS[u.unit].endurance;
}

/* ---------- effective stats with every modifier ---------- */

/** §4.4 — charisma: +10%/level army-wide, +15%/level within Glance radius. */
export function charismaMult(s: BattleState, u: BattleUnit): number {
  const g = generalOf(s, u.player);
  if (g.condition === "dead") return 1;
  const cha = GENERAL_DEFS[g.general].charisma * (g.condition === "fled" ? 0.5 : 1);
  const rate = withinGlance(s, u) ? 0.15 : 0.1;
  return 1 + cha * rate;
}

/** §4.5.1.3 — negative victory bar shaves the Morale stat proportionally. */
export function victoryBarMoraleMult(s: BattleState, player: PlayerId): number {
  const bar = victoryBar(s); // positive favours P1
  const own = player === 0 ? bar : -bar;
  return own < 0 ? 1 + own / 200 : 1;
}

/** Physical attack, §4.3.5 modifiers except the charge bonus. */
export function attackStat(s: BattleState, u: BattleUnit, enemyHigher = false): number {
  const def = UNIT_DEFS[u.unit];
  let atk = def.attack;
  atk *= 1 - 0.2 * u.casualties;
  atk *= 1 - 0.15 * fatigueLevels(u);
  atk *= charismaMult(s, u);
  // §4.3.4 — cavalry in woods, rivers, or fighting uphill: -25%
  if (def.arm === "cavalry" && (u.terrain.woods || u.terrain.river || enemyHigher)) atk *= 0.75;
  return Math.max(0.1, atk);
}

export interface ChargeContext {
  targetWeightLight: boolean;
  targetIsElephant: boolean;
  targetPikeWallFrontal: boolean;
  attackerIsCavalry: boolean;
}

/** The charge bonus on the first turn of a combat (§4.3.5.1). */
export function chargeBonus(s: BattleState, u: BattleUnit, ctx: ChargeContext): number {
  const def = UNIT_DEFS[u.unit];
  let ch = def.charge;
  ch *= 1 - 0.33 * u.disorder;
  ch *= 1 - 0.2 * u.casualties;
  ch *= Math.max(0, 1 - 0.5 * u.lastClimb); // uphill charge (§4.3.4)
  if (def.special?.chargeHalvedVsLight && ctx.targetWeightLight) ch *= 0.5;
  if (def.special?.chargeHalvedVsElephants && ctx.targetIsElephant) ch *= 0.5;
  if (ctx.targetPikeWallFrontal) ch *= ctx.attackerIsCavalry ? 0 : 0.5;
  void s;
  return Math.max(0, ch);
}

/** §4.3.6 — morale below base 3 cuts total physical attack 20%/level. */
export function moraleAttackMult(u: BattleUnit): number {
  return Math.max(0.2, 1 - 0.2 * Math.max(0, 3 - u.morale));
}

export function defenseStat(
  s: BattleState,
  u: BattleUnit,
  opts: { frontal: boolean; vsCavalry: boolean; vsRanged: boolean; enemyHigher: boolean },
): number {
  const def = UNIT_DEFS[u.unit];
  let d = def.defense;
  if (def.special?.defenseVsCavalry && opts.vsCavalry) d += def.special.defenseVsCavalry;
  if (def.special?.defenseVsRanged && opts.vsRanged) d += def.special.defenseVsRanged;
  // §4.3.4 — cavalry in woods, rivers, or facing a foe uphill: -25%
  if (def.arm === "cavalry" && (u.terrain.woods || u.terrain.river || opts.enemyHigher)) d *= 0.75;
  if (opts.frontal) {
    let form = def.formation;
    form *= 1 - 0.33 * u.disorder;
    form *= 1 - 0.2 * u.casualties;
    if (u.terrain.woods || u.terrain.river) form *= 0.5;
    d += Math.max(0, form);
  }
  void s;
  return Math.max(0.1, d);
}

/** Effective Morale stat (§4.3.6 + charisma + victory bar + sack). */
export function moraleStat(s: BattleState, u: BattleUnit): number {
  const def = UNIT_DEFS[u.unit];
  let m = def.morale;
  m *= 1 - 0.1 * u.disorder;
  m *= 1 - 0.15 * fatigueLevels(u);
  m *= 1 - 0.2 * u.casualties;
  m *= charismaMult(s, u);
  m *= victoryBarMoraleMult(s, u.player);
  if (s.campSacked[u.player]) m -= 1; // flat, persistent (§4.5.1.2)
  return Math.max(0.5, m);
}

export function trainingStat(u: BattleUnit): number {
  return UNIT_DEFS[u.unit].training;
}

/** Speed budget in metres for one Battle Phase (§4.3.1 + fatigue). */
export function speedBudgetM(u: BattleUnit): number {
  const def = UNIT_DEFS[u.unit];
  return def.speed * 100 * (1 - 0.15 * fatigueLevels(u));
}

/* ---------- victory bar (§4.5.1.3) ---------- */

/** Strength = base cost of units alive and not routing. */
export function sideStrength(s: BattleState, player: PlayerId): number {
  let total = 0;
  for (const u of liveUnits(s, player)) {
    if (u.status === "routing") continue;
    total += UNIT_DEFS[u.unit].cost;
  }
  return total;
}

/** Positive favours Player 1; ±100 at 3:1 odds, log-scaled between. */
export function victoryBar(s: BattleState): number {
  const a = sideStrength(s, 0);
  const b = sideStrength(s, 1);
  if (a <= 0 && b <= 0) return 0;
  if (a <= 0) return -100;
  if (b <= 0) return 100;
  const bar = (Math.log(a / b) / Math.log(3)) * 100;
  return Math.max(-100, Math.min(100, bar));
}

/** §4.5.2 — cost alive & not fleeing / total spent (for the 75% rout rule). */
export function armyIntactFraction(s: BattleState, player: PlayerId): number {
  const spentOnUnits = totalSpent(s.musters[player]) - generalCost(s, player);
  if (spentOnUnits <= 0) return 0;
  let alive = 0;
  const counted = new Map<UnitId, number>();
  for (const u of liveUnits(s, player)) {
    if (u.status === "routing") continue;
    if (u.uid >= 9000) continue; // the general's escort was free
    const n = (counted.get(u.unit) ?? 0) + 1;
    counted.set(u.unit, n);
    alive += unitSpend(u.unit, n) - unitSpend(u.unit, n - 1);
  }
  return alive / spentOnUnits;
}

function generalCost(s: BattleState, player: PlayerId): number {
  return GENERAL_DEFS[s.musters[player].general!].cost;
}

/* ---------- general attach / detach (§3.4, §4.4) ---------- */

/** His own unit "disappears" and he rides at the host's centre. */
export function attachGeneralTo(s: BattleState, player: PlayerId, hostUid: number): void {
  const g = s.generals[player];
  const escort = unitByUid(s, g.unitUid);
  if (escort) {
    escort.removed = true;
    escort.engaged = [];
  }
  g.attachedTo = hostUid;
  g.unitUid = -1;
}

/** He steps off: his escort re-forms on the spot, Hetairoi profile intact. */
export function detachGeneralFrom(s: BattleState, player: PlayerId): void {
  const g = s.generals[player];
  const host = g.attachedTo !== null ? unitByUid(s, g.attachedTo) : undefined;
  const x = host?.x ?? g.x;
  const y = host?.y ?? g.y;
  const angle = host?.angle ?? (player === 0 ? 0 : Math.PI);
  g.attachedTo = null;
  g.x = x;
  g.y = y;
  const uid = 9000 + player;
  const existing = unitByUid(s, uid);
  if (existing) {
    existing.removed = false;
    existing.fled = false;
    existing.x = x;
    existing.y = y;
    existing.angle = angle;
    existing.status = "normal";
    existing.order = null;
    existing.engaged = [];
    existing.terrain = terrainAt(s.def, x, y);
  } else {
    s.units.push({
      uid,
      unit: "hetairoi",
      player,
      x,
      y,
      angle,
      morale: 3,
      fatigue: 0,
      disorder: 0,
      casualties: 0,
      fatigueSpent: 0,
      status: "normal",
      order: null,
      waitBank: 0,
      engaged: [],
      restingForced: false,
      routGoal: null,
      pursuitTarget: null,
      lastClimb: 0,
      terrain: terrainAt(s.def, x, y),
      removed: false,
      fled: false,
    });
  }
  g.unitUid = uid;
}

/* ---------- misc geometry ---------- */

export function ownCamp(player: PlayerId): { x: number; y: number } {
  return player === 0 ? CAMPS.south : CAMPS.north;
}

export function ownEdgeY(player: PlayerId): number {
  return player === 0 ? MAP_SIZE_M : 0;
}

export function inCamp(player: PlayerId, x: number, y: number): boolean {
  const c = ownCamp(player);
  return Math.abs(x - c.x) <= 250 && Math.abs(y - c.y) <= 250;
}
