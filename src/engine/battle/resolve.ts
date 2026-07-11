import type { PlayerId } from "../types";
import { UNIT_DEFS } from "../data/units";
import { GENERAL_DEFS } from "../data/generals";
import { elevationLevelAt, MAP_SIZE_M, terrainAt } from "../battlefield";
import { Rng } from "../rng";
import { facing, unitsOverlap, UNIT_HALF_D } from "../field";
import {
  attackStat,
  chargeBonus,
  defenseStat,
  detachGeneralFrom,
  enduranceOf,
  fatigueLevels,
  generalOf,
  generalPosition,
  inCamp,
  liveUnits,
  moraleAttackMult,
  moraleStat,
  ownCamp,
  ownEdgeY,
  armyIntactFraction,
  trainingStat,
  unitByUid,
  victoryBar,
  withinGlance,
  type BattleGeneral,
  type BattleState,
  type BattleUnit,
} from "./state";
import { GLANCE_RADIUS, unitGapM } from "./orders";

/* ============================================================
   §4.3 — the Battle Phase resolver. One call advances the whole
   battle by a turn: movement (with keyframes for the playback),
   ranged and physical combat, morale, rout/pursuit/rally,
   recovery, generals, and the endgame checks.
   ============================================================ */

export interface Keyframes {
  /** uid → positions per tick (equal length for all units). */
  paths: Map<number, { x: number; y: number; angle: number }[]>;
  ticks: number;
}

const TICKS = 12;
const STEP = 40; // metres per micro-step inside a tick

export function resolveBattlePhase(s: BattleState, rng: Rng): Keyframes {
  s.events = [];
  s.fx = [];
  s.log = [];
  const frames: Keyframes = { paths: new Map(), ticks: TICKS };
  for (const u of liveUnits(s)) frames.paths.set(u.uid, [{ x: u.x, y: u.y, angle: u.angle }]);

  const wasEngaged = new Map<number, number[]>();
  for (const u of liveUnits(s)) wasEngaged.set(u.uid, [...u.engaged]);

  disengagementAttacks(s, rng, wasEngaged);
  moveAll(s, rng, frames);
  refreshContacts(s);
  rangedCombat(s, rng);
  meleeCombat(s, rng, wasEngaged);
  routsAndPursuits(s, rng, frames);
  generalsPhase(s, rng);
  fatigueFromCombat(s);
  recoveryPhase(s, rng);
  endgameChecks(s, rng);

  padFrames(frames);
  s.turn++;
  return frames;
}

/* ---------- probability helpers ---------- */

/** A check that an attached general's unit rolls with Advantage (§4.4). */
function check(s: BattleState, rng: Rng, u: BattleUnit | null, p: number): boolean {
  const clamped = Math.max(0, Math.min(0.97, p));
  const attached = u !== null && s.generals.some((g) => g.attachedTo === u.uid);
  if (attached) return rng.chance(clamped) || rng.chance(clamped);
  return rng.chance(clamped);
}

/** Same but for RESISTING something bad: advantage = two tries to resist. */
const resist = check;

/* ---------- movement ---------- */

interface MovePlan {
  u: BattleUnit;
  dest: { x: number; y: number } | null;
  faceTarget: BattleUnit | null;
  fast: boolean;
  budget: number;
  startElev: number;
  touchedRiver: boolean;
  climbed: number;
}

function moveAll(s: BattleState, rng: Rng, frames: Keyframes): void {
  const plans: MovePlan[] = [];

  for (const u of liveUnits(s)) {
    if (u.restingForced) {
      u.restingForced = false;
      continue; // §4.3.6 — the exhausted stand still this phase
    }
    const plan = planFor(s, u);
    if (plan) plans.push(plan);
  }

  // rotation costs & checks up front (§4.3.1–4.3.2)
  for (const p of plans) {
    if (!p.dest && !p.faceTarget) continue;
    const target = p.dest ?? { x: p.faceTarget!.x, y: p.faceTarget!.y };
    const want = Math.atan2(target.x - p.u.x, -(target.y - p.u.y));
    let delta = normAngle(want - p.u.angle);
    const deg = Math.abs((delta * 180) / Math.PI);
    if (deg > 150) {
      // about-face: flat 100 m, gentler disorder check (§4.3.2)
      p.budget -= 100;
      if (!resist(s, rng, p.u, 1 - 0.3 / trainingStat(p.u))) addDisorder(p.u, 1);
      p.u.angle = normAngle(p.u.angle + delta);
    } else if (deg > 8) {
      p.budget -= (deg / 45) * 100; // rotating at half pace
      const checks = Math.floor(deg / 45);
      for (let i = 0; i < checks; i++) {
        if (!resist(s, rng, p.u, 1 - 0.6 / trainingStat(p.u))) addDisorder(p.u, 1);
      }
      p.u.angle = normAngle(p.u.angle + delta);
    } else {
      p.u.angle = normAngle(p.u.angle + delta);
    }
    // §4.3.2 — fast pace: one check per phase
    if (p.fast && p.dest) {
      if (!resist(s, rng, p.u, 1 - 0.6 / trainingStat(p.u))) addDisorder(p.u, 1);
    }
  }

  // interleaved micro-stepping so contacts happen mid-phase
  const perTick = plans.map((p) => Math.max(0, p.budget) / TICKS);
  for (let tick = 0; tick < TICKS; tick++) {
    for (let i = 0; i < plans.length; i++) {
      const p = plans[i]!;
      if (!p.dest || p.u.removed || p.u.fled) continue;
      let left = perTick[i]!;
      while (left > 0) {
        const dx = p.dest.x - p.u.x;
        const dy = p.dest.y - p.u.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 8) {
          p.dest = null;
          if (p.u.order?.type === "march") p.u.order = null; // arrived
          break;
        }
        const step = Math.min(STEP, dist);
        const probeX = p.u.x + (dx / dist) * step;
        const probeY = p.u.y + (dy / dist) * step;
        const mult = terrainCostMult(s, p.u, probeX, probeY, p);
        // spend what the tick affords: rough ground shortens the stride
        // instead of freezing the unit at the terrain's edge
        const stepLen = Math.min(step, left / mult);
        if (stepLen < 1) {
          left = 0;
          break;
        }
        const nx = p.u.x + (dx / dist) * stepLen;
        const ny = p.u.y + (dy / dist) * stepLen;
        // enemies are impassable (§4.3.1): stop at contact
        const blocked = enemyContactAt(s, p.u, nx, ny);
        if (blocked) {
          p.dest = null;
          left = 0;
          break;
        }
        applyStepEffects(s, p, nx, ny, stepLen);
        p.u.x = nx;
        p.u.y = ny;
        left -= stepLen * mult;
      }
    }
    for (const u of liveUnits(s)) {
      frames.paths.get(u.uid)?.push({ x: u.x, y: u.y, angle: u.angle });
    }
  }

  // river / woods disorder, once per phase if crossed (§4.3.2)
  for (const p of plans) {
    if (p.touchedRiver) {
      addDisorder(p.u, 1);
      if (rng.chance(0.67)) addDisorder(p.u, 1);
    }
    p.u.lastClimb = p.climbed;
    p.u.terrain = terrainAt(s.def, p.u.x, p.u.y);
    if (p.u.terrain.woods && rng.chance(0.67)) addDisorder(p.u, 1);
    // fatigue: slope + river presence (§4.3.3)
    if (p.climbed > 0) addFatigue(s, p.u, 0.3 * p.climbed);
    if (p.touchedRiver) addFatigue(s, p.u, 1);
  }
}

function planFor(s: BattleState, u: BattleUnit): MovePlan | null {
  const base: MovePlan = {
    u,
    dest: null,
    faceTarget: null,
    fast: false,
    budget: UNIT_DEFS[u.unit].speed * 100 * (1 - 0.15 * fatigueLevels(u)),
    startElev: elevationLevelAt(s.def, u.x, u.y),
    touchedRiver: false,
    climbed: 0,
  };

  if (u.status === "routing") {
    base.fast = fatigueLevels(u) < 3;
    if (base.fast) base.budget *= 1.5;
    const goal =
      u.routGoal === "camp" ? ownCamp(u.player) : { x: u.x, y: ownEdgeY(u.player) };
    base.dest = goal;
    return base;
  }
  if (u.status === "pursuing") {
    const t = u.pursuitTarget !== null ? unitByUid(s, u.pursuitTarget) : undefined;
    if (t && !t.removed && !t.fled) {
      base.fast = fatigueLevels(u) < 3;
      if (base.fast) base.budget *= 1.5;
      base.dest = { x: t.x, y: t.y };
      return base;
    }
    return null;
  }
  if (u.status === "sacking") return null;

  const o = u.order;
  if (!o) return null;
  switch (o.type) {
    case "march":
      base.fast = o.fast;
      if (o.fast) base.budget *= 1.5;
      base.dest = { x: o.dest.x, y: o.dest.y };
      return base;
    case "attack": {
      const t = nearestTarget(s, u, o.targets);
      if (!t) {
        u.order = null;
        return null;
      }
      base.fast = o.fast;
      if (o.fast) base.budget *= 1.5;
      base.dest = { x: t.x, y: t.y };
      return base;
    }
    case "face": {
      const t = nearestTarget(s, u, o.targets);
      if (t) base.faceTarget = t;
      return base;
    }
    case "skirmish": {
      const t = nearestTarget(s, u, o.targets) ?? nearestEnemy(s, u);
      const rp = UNIT_DEFS[u.unit].ranged;
      if (!t || !rp) return null;
      const d = Math.hypot(t.x - u.x, t.y - u.y);
      const threat = nearestEnemy(s, u);
      const threatDist = threat ? Math.hypot(threat.x - u.x, threat.y - u.y) : Infinity;
      // §4.1.1 — retreat the moment an enemy closes within 50 m of contact
      if (threatDist < 50 + 2 * UNIT_HALF_D) {
        const away = Math.atan2(u.x - threat!.x, -(u.y - threat!.y));
        base.dest = {
          x: u.x + Math.sin(away) * rp.rangeM,
          y: u.y - Math.cos(away) * rp.rangeM,
        };
        base.fast = true;
        base.budget *= 1.5;
      } else if (d > rp.rangeM) {
        // close to just within firing distance, then shoot
        const toward = Math.atan2(t.x - u.x, -(t.y - u.y));
        const stop = d - rp.rangeM + UNIT_HALF_D;
        base.dest = { x: u.x + Math.sin(toward) * stop, y: u.y - Math.cos(toward) * stop };
        if (o.fast) {
          base.fast = true;
          base.budget *= 1.5;
        }
      } else {
        base.faceTarget = t;
      }
      return base;
    }
    case "avoid": {
      const t = nearestTarget(s, u, o.targets);
      if (!t) return null;
      const d = Math.hypot(t.x - u.x, t.y - u.y);
      if (d < 600) {
        const away = Math.atan2(u.x - t.x, -(u.y - t.y));
        base.dest = { x: u.x + Math.sin(away) * 600, y: u.y - Math.cos(away) * 600 };
        if (o.fast) {
          base.fast = true;
          base.budget *= 1.5;
        }
      }
      return base;
    }
    case "wait":
      return null; // handled in recoveryPhase
  }
}

function terrainCostMult(s: BattleState, u: BattleUnit, x: number, y: number, p: MovePlan): number {
  const def = UNIT_DEFS[u.unit];
  const t = terrainAt(s.def, x, y);
  let mult = 1;
  if (t.river) mult *= def.weight === "light" ? 2 : 5; // §4.3.1
  if (t.woods) mult *= def.weight === "light" && def.arm === "infantry" ? 1.43 : 2.5;
  if (t.sea) mult *= 50;
  // passing through friendly troops (§4.3.1)
  for (const other of liveUnits(s, u.player)) {
    if (other.uid === u.uid) continue;
    if (Math.abs(other.x - x) < 220 && Math.abs(other.y - y) < 220 && unitsOverlap({ x, y, angle: u.angle }, other)) {
      const light = UNIT_DEFS[u.unit].weight === "light" && UNIT_DEFS[u.unit].arm === "infantry";
      mult *= light ? 1.33 : 2;
      break;
    }
  }
  void p;
  return mult;
}

function applyStepEffects(s: BattleState, p: MovePlan, nx: number, ny: number, step: number): void {
  const t = terrainAt(s.def, nx, ny);
  if (t.river) p.touchedRiver = true;
  const eOld = elevationLevelAt(s.def, p.u.x, p.u.y);
  const eNew = elevationLevelAt(s.def, nx, ny);
  if (eNew > eOld) {
    p.climbed += eNew - eOld;
    // climbing consumes 25% extra per level — approximate by shaving budget
    p.budget -= step * 0.25 * (eNew - eOld);
  }
  if (p.fast) addFatigue(s, p.u, (0.2 * step) / 100);
}

function enemyContactAt(s: BattleState, u: BattleUnit, x: number, y: number): BattleUnit | null {
  const probe = { x, y, angle: u.angle };
  const passesLight = UNIT_DEFS[u.unit].special?.passesThroughEnemyLight === true;
  for (const e of liveUnits(s, (1 - u.player) as PlayerId)) {
    if (passesLight && UNIT_DEFS[e.unit].weight === "light") continue;
    if (unitsOverlap(probe, e)) return e;
  }
  return null;
}

function refreshContacts(s: BattleState): void {
  for (const u of liveUnits(s)) u.engaged = [];
  const all = liveUnits(s);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]!;
      const b = all[j]!;
      if (a.player === b.player) continue;
      if (Math.abs(a.x - b.x) > 360 || Math.abs(a.y - b.y) > 360) continue;
      // touching = overlap, or a small gap left by the 40 m micro-step
      if (unitsOverlap(a, b) || unitGapM(a, b) <= 45) {
        a.engaged.push(b.uid);
        b.engaged.push(a.uid);
      }
    }
  }
}

/* ---------- §4.2.3 — opportunity attacks on disengagement ---------- */

function disengagementAttacks(s: BattleState, rng: Rng, wasEngaged: Map<number, number[]>): void {
  for (const u of liveUnits(s)) {
    const prev = wasEngaged.get(u.uid) ?? [];
    if (prev.length === 0 || !u.order) continue;
    const staysFighting =
      u.order.type === "attack" && u.order.targets.some((t) => prev.includes(t));
    if (staysFighting || u.order.type === "wait") continue;
    for (const euid of prev) {
      const e = unitByUid(s, euid);
      if (!e || e.removed || e.fled) continue;
      if (UNIT_DEFS[u.unit].speed >= UNIT_DEFS[e.unit].speed * 1.2) continue; // clean break
      // advantage attack against flank/rear (§4.2.3)
      combatRound(s, rng, e, u, { firstTurn: false, arc: "rear", advantage: true });
    }
  }
}

/* ---------- ranged combat (§4.3.5.2) ---------- */

function rangedCombat(s: BattleState, rng: Rng): void {
  for (const u of liveUnits(s)) {
    if (u.status !== "normal") continue;
    const def = UNIT_DEFS[u.unit];
    const rp = def.ranged;
    if (!rp) continue;
    if (u.engaged.length > 0) continue; // locked in melee
    if (u.order?.type === "attack" && !u.order.secondary && def.primary === "melee") continue;
    if (u.order?.type === "wait") continue;

    let target: BattleUnit | null = null;
    if (u.order?.type === "attack" || u.order?.type === "skirmish") {
      target = nearestTarget(s, u, u.order.targets);
    }
    target ??= nearestEnemy(s, u);
    if (!target) continue;
    const d = Math.hypot(target.x - u.x, target.y - u.y);
    if (d > rp.rangeM + UNIT_HALF_D) continue;

    let atk = rp.attack;
    if (def.special?.rangedBonusVsHeavy && UNIT_DEFS[target.unit].weight === "heavy") {
      atk += def.special.rangedBonusVsHeavy;
    }
    atk *= 1 - 0.2 * u.casualties;
    atk *= 1 - 0.15 * fatigueLevels(u);
    atk *= moraleAttackMult(u);

    // friendly units and woods on the line of fire (§4.3.4, §4.3.5.2)
    if (lineCrossesFriendly(s, u, target)) atk *= 1 - rp.friendlyFirePenalty;
    if (lineCrossesWoods(s, u, target)) atk *= 0.25;

    const arc = arcOfAttack(target, u);
    const defVal = defenseStat(s, target, {
      frontal: arc === "front",
      vsCavalry: false,
      vsRanged: true,
      enemyHigher:
        elevationLevelAt(s.def, u.x, u.y) > elevationLevelAt(s.def, target.x, target.y),
    });
    s.fx.push({ kind: "shoot", x: u.x, y: u.y, x2: target.x, y2: target.y, at: 0.55 + rng.next() * 0.25 });
    s.log.push(
      `⌖ ${UNIT_DEFS[u.unit].name}(P${u.player + 1}) shoots ${UNIT_DEFS[target.unit].name}: atk ${atk.toFixed(1)} vs def ${defVal.toFixed(1)}`,
    );
    rollDamage(s, rng, u, target, atk, defVal, { training: false });
  }
}

function lineCrossesFriendly(s: BattleState, u: BattleUnit, t: BattleUnit): boolean {
  for (const f of liveUnits(s, u.player)) {
    if (f.uid === u.uid) continue;
    if (segmentNearPoint(u.x, u.y, t.x, t.y, f.x, f.y, 110)) return true;
  }
  return false;
}

function lineCrossesWoods(s: BattleState, u: BattleUnit, t: BattleUnit): boolean {
  const steps = 6;
  for (let i = 1; i < steps; i++) {
    const x = u.x + ((t.x - u.x) * i) / steps;
    const y = u.y + ((t.y - u.y) * i) / steps;
    if (terrainAt(s.def, x, y).woods) return true;
  }
  return false;
}

function segmentNearPoint(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
  r: number,
): boolean {
  const abx = bx - ax;
  const aby = by - ay;
  const t = Math.max(0.12, Math.min(0.88, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1)));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t)) < r;
}

/* ---------- melee combat (§4.3.5.1 / §4.3.5.3) ---------- */

type Arc = "front" | "flank" | "rear";

function arcOfAttack(defender: BattleUnit, attacker: { x: number; y: number }): Arc {
  const [fx, fy] = facing(defender);
  const dx = attacker.x - defender.x;
  const dy = attacker.y - defender.y;
  const df = dx * fx + dy * fy;
  const ang = (Math.acos(Math.max(-1, Math.min(1, df / (Math.hypot(dx, dy) || 1)))) * 180) / Math.PI;
  if (ang < 55) return "front";
  if (ang > 125) return "rear";
  return "flank";
}

function meleeCombat(s: BattleState, rng: Rng, wasEngaged: Map<number, number[]>): void {
  const fought = new Set<string>();
  for (const u of liveUnits(s)) {
    for (const euid of [...u.engaged]) {
      const key = u.uid < euid ? `${u.uid}:${euid}` : `${euid}:${u.uid}`;
      if (fought.has(key)) continue;
      fought.add(key);
      const e = unitByUid(s, euid);
      if (!e || e.removed || e.fled) continue;

      const firstTurn = !(wasEngaged.get(u.uid) ?? []).includes(euid);
      const arcOnE = arcOfAttack(e, u);
      const arcOnU = arcOfAttack(u, e);

      const preMoraleU = u.morale;
      const preMoraleE = e.morale;

      // only a unit's front lets it strike (§4.3.5.3): u strikes iff e
      // stands in u's frontal arc, and vice versa
      const uStrikes = arcOfAttack(u, e) === "front" && u.status !== "routing";
      const eStrikes = arcOfAttack(e, u) === "front" && e.status !== "routing";

      if (uStrikes) {
        combatRound(s, rng, u, e, { firstTurn, arc: arcOnE, advantage: false });
      }
      if (eStrikes && !e.removed && !u.removed) {
        combatRound(s, rng, e, u, { firstTurn, arc: arcOnU, advantage: false });
      }

      // simultaneous rout: a coin decides (§4.3.5.1)
      if (preMoraleU > 0 && preMoraleE > 0 && u.morale <= 0 && e.morale <= 0) {
        if (rng.chance(0.5)) u.morale = 1;
        else e.morale = 1;
      }
    }
  }
}

interface RoundOpts {
  firstTurn: boolean;
  arc: Arc;
  advantage: boolean;
}

function combatRound(s: BattleState, rng: Rng, atkU: BattleUnit, defU: BattleUnit, opts: RoundOpts): void {
  const aDef = UNIT_DEFS[atkU.unit];
  const dDef = UNIT_DEFS[defU.unit];
  const enemyHigher =
    elevationLevelAt(s.def, defU.x, defU.y) > elevationLevelAt(s.def, atkU.x, atkU.y);

  let atk = attackStat(s, atkU, enemyHigher);
  if (opts.firstTurn) {
    atk += chargeBonus(s, atkU, {
      targetWeightLight: dDef.weight === "light",
      targetIsElephant: defU.unit === "elephantes",
      targetPikeWallFrontal: dDef.special?.pikeWall === true && opts.arc === "front",
      attackerIsCavalry: aDef.arm === "cavalry",
    });
  }
  atk *= moraleAttackMult(atkU);

  const defVal = defenseStat(s, defU, {
    frontal: opts.arc === "front",
    vsCavalry: aDef.arm === "cavalry",
    vsRanged: false,
    enemyHigher: !enemyHigher && elevationLevelAt(s.def, atkU.x, atkU.y) > elevationLevelAt(s.def, defU.x, defU.y),
  });

  const flanked = opts.arc !== "front";
  const mx = (atkU.x + defU.x) / 2;
  const my = (atkU.y + defU.y) / 2;
  s.fx.push({ kind: "clash", x: mx, y: my, at: 0.7 + rng.next() * 0.25 });
  s.log.push(
    `⚔ ${UNIT_DEFS[atkU.unit].name}(P${atkU.player + 1}) hits ${UNIT_DEFS[defU.unit].name} on the ${opts.arc}${opts.firstTurn ? ", charging" : ""}: atk ${atk.toFixed(1)} vs def ${defVal.toFixed(1)} (${Math.round((0.33 * atk) / defVal * 100)}%/cas)`,
  );
  rollDamage(s, rng, atkU, defU, atk, defVal, {
    training: true,
    doubleMoraleDisorder: flanked,
    advantage: opts.advantage,
  });
}

function rollDamage(
  s: BattleState,
  rng: Rng,
  atkU: BattleUnit,
  defU: BattleUnit,
  atk: number,
  defVal: number,
  opts: { training: boolean; doubleMoraleDisorder?: boolean; advantage?: boolean },
): void {
  const adv = opts.advantage === true;
  const roll = (p: number, beneficiary: BattleUnit): boolean =>
    adv ? rng.chance(clamp01(p)) || rng.chance(clamp01(p)) : check(s, rng, beneficiary, p);

  // casualties: chain while successful (§4.3.5.1)
  const pCas = 0.33 * (atk / defVal);
  let casDealt = 0;
  while (roll(pCas, atkU)) {
    defU.casualties++;
    casDealt++;
    s.stats[atkU.player].casualtiesInflicted++;
    generalCasualtyRoll(s, rng, defU);
    if (defU.casualties > 3) {
      s.fx.push({ kind: "casualty", x: defU.x, y: defU.y, at: 0.75 });
      destroyUnit(s, defU, atkU);
      return;
    }
  }
  if (casDealt > 0) {
    s.fx.push({ kind: "casualty", x: defU.x, y: defU.y, at: 0.78 });
    s.log.push(`   → ${casDealt} casualty level${casDealt > 1 ? "s" : ""} on ${UNIT_DEFS[defU.unit].name} (now ${defU.casualties})`);
  }

  // morale: Morale stat replaces Defense (§4.3.5.1); flanking doubles
  // the morale and disorder attacks (§4.3.5.3)
  const mor = Math.max(0.5, moraleStat(s, defU));
  const reps = opts.doubleMoraleDisorder ? 2 : 1;
  let morLost = 0;
  for (let r = 0; r < reps; r++) {
    const pMor = 0.33 * (atk / mor);
    while (roll(pMor, atkU) && defU.morale > 0) {
      defU.morale--;
      morLost++;
    }
  }
  if (morLost > 0) {
    s.fx.push({ kind: "morale", x: defU.x, y: defU.y, at: 0.8 });
    s.log.push(`   → ${morLost} morale on ${UNIT_DEFS[defU.unit].name} (now ${defU.morale})`);
  }

  // disorder: Training replaces Defense
  const tr = trainingStat(defU);
  let disGained = 0;
  for (let r = 0; r < reps; r++) {
    const pDis = 0.33 * (atk / tr);
    while (roll(pDis, atkU) && defU.disorder < 3) {
      addDisorder(defU, 1);
      disGained++;
    }
  }
  if (disGained > 0) s.fx.push({ kind: "disorder", x: defU.x, y: defU.y, at: 0.82 });

  // training-difference check for the more orderly side (§4.3.5.1)
  if (opts.training) {
    const ta = trainingStat(atkU);
    const td = trainingStat(defU);
    if (ta !== td) {
      const orderly = ta > td ? atkU : defU;
      const diff = Math.abs(ta - td);
      const p = Math.max(0, (8 - diff) * 0.1);
      if (rng.chance(p)) addDisorder(orderly, 1);
    }
  }
}

function clamp01(p: number): number {
  return Math.max(0, Math.min(0.97, p));
}

function destroyUnit(s: BattleState, u: BattleUnit, by: BattleUnit | null): void {
  u.removed = true;
  u.engaged = [];
  s.stats[u.player === 0 ? 1 : 0].unitsDestroyed++;
  s.events.push({
    kind: "destroyed",
    text: `The ${UNIT_DEFS[u.unit].name} of Player ${u.player + 1} are wiped out${by ? ` by the ${UNIT_DEFS[by.unit].name}` : ""}.`,
  });
  const g = s.generals.find((g2) => g2.attachedTo === u.uid || g2.unitUid === u.uid);
  if (g && g.condition === "fighting") generalUnitLost(s, g, u);
}

/* ---------- routing, pursuit, rally (§4.3.7) ---------- */

function routsAndPursuits(s: BattleState, rng: Rng, frames: Keyframes): void {
  for (const u of liveUnits(s)) {
    if (u.status !== "routing" && u.morale <= 0) {
      startRout(s, rng, u, frames);
    }
  }

  // rout contagion + rallying by nearby friends
  for (const u of liveUnits(s)) {
    if (u.status !== "routing") continue;
    const uDef = UNIT_DEFS[u.unit];
    for (const f of liveUnits(s, u.player)) {
      if (f.uid === u.uid || f.status === "routing") continue;
      if (Math.hypot(f.x - u.x, f.y - u.y) > 200 + 150) continue;
      // §4.3.7.1 — the friend checks against the fleeing unit's panic
      const panic = uDef.defense + uDef.formation + uDef.morale;
      const diff = panic - moraleStat(s, f);
      const p = Math.max(0, Math.min(1, diff * 0.1));
      if (!resist(s, rng, f, 1 - p)) {
        f.morale = 0;
        startRout(s, rng, f, frames);
        continue;
      }
      // the steady friend may rally the fugitive
      if (u.engaged.length === 0) {
        const steady = UNIT_DEFS[f.unit].defense + UNIT_DEFS[f.unit].formation + moraleStat(s, f);
        let p2 = steady * 0.05;
        const g = generalOf(s, u.player);
        if (g.rallying && g.condition === "fighting" && withinGlance(s, u)) {
          p2 += 0.15 * GENERAL_DEFS[g.general].charisma;
        }
        if (rng.chance(Math.min(0.97, p2))) {
          u.status = "normal";
          u.morale = Math.max(u.morale, 1);
          u.routGoal = null;
          s.events.push({
            kind: "rally",
            text: `The ${UNIT_DEFS[u.unit].name} of Player ${u.player + 1} rally beside the ${UNIT_DEFS[f.unit].name}.`,
          });
        }
      }
    }
  }

  // reaching safety
  for (const u of liveUnits(s)) {
    if (u.status !== "routing") continue;
    if (u.routGoal === "camp" && inCamp(u.player, u.x, u.y)) {
      const occupied = liveUnits(s, (1 - u.player) as PlayerId).some((e) => inCamp(u.player, e.x, e.y));
      if (occupied) u.routGoal = "edge";
      else {
        u.status = "normal";
        u.morale = Math.max(u.morale, 1);
        u.routGoal = null;
        s.events.push({
          kind: "rally",
          text: `The ${UNIT_DEFS[u.unit].name} of Player ${u.player + 1} reform inside their camp.`,
        });
      }
    }
    if (u.routGoal === "edge" && (u.y <= 30 || u.y >= MAP_SIZE_M - 30)) {
      u.fled = true;
      s.events.push({
        kind: "rout",
        text: `The ${UNIT_DEFS[u.unit].name} of Player ${u.player + 1} stream off the field.`,
      });
    }
  }

  // pursuit exit checks (§4.3.7.2)
  for (const u of liveUnits(s)) {
    if (u.status !== "pursuing") continue;
    const t = u.pursuitTarget !== null ? unitByUid(s, u.pursuitTarget) : undefined;
    if (!t || t.removed || t.fled || t.status !== "routing") {
      u.status = "normal";
      u.pursuitTarget = null;
      continue;
    }
    if (rng.chance(trainingStat(u) / 6)) {
      u.status = "normal";
      u.pursuitTarget = null;
    } else {
      addDisorder(u, 1);
    }
  }
}

function startRout(s: BattleState, rng: Rng, u: BattleUnit, frames: Keyframes): void {
  u.status = "routing";
  u.morale = 0;
  u.order = null;
  s.fx.push({ kind: "rout", x: u.x, y: u.y, at: 0.9 });
  u.routGoal = rng.chance(0.5) ? "camp" : "edge";
  s.stats[u.player === 0 ? 1 : 0].unitsRouted++;
  s.events.push({
    kind: "rout",
    text: `The ${UNIT_DEFS[u.unit].name} of Player ${u.player + 1} break and run!`,
  });

  const g = s.generals.find((g2) => g2.attachedTo === u.uid);
  if (g) detachGeneralInPlace(s, g, u);
  const gOwn = s.generals.find((g2) => g2.unitUid === u.uid && g2.condition === "fighting");
  if (gOwn) generalUnitLost(s, gOwn, u);

  // §4.3.7.1 — the first flight move happens immediately
  const goal = u.routGoal === "camp" ? ownCamp(u.player) : { x: u.x, y: ownEdgeY(u.player) };
  const d = Math.hypot(goal.x - u.x, goal.y - u.y) || 1;
  const dist = Math.min(UNIT_DEFS[u.unit].speed * 100 * 1.5, d);
  const nx = u.x + ((goal.x - u.x) / d) * dist;
  const ny = u.y + ((goal.y - u.y) / d) * dist;
  // elephants and chariots trample friends they flee through (§1.4)
  if (UNIT_DEFS[u.unit].special?.tramplesAlliesOnRout) {
    for (const f of liveUnits(s, u.player)) {
      if (f.uid === u.uid) continue;
      if (segmentNearPoint(u.x, u.y, nx, ny, f.x, f.y, 140)) {
        f.casualties++;
        if (f.casualties > 3) destroyUnit(s, f, null);
        s.events.push({
          kind: "info",
          text: `Panicking ${UNIT_DEFS[u.unit].name} trample through the ${UNIT_DEFS[f.unit].name}!`,
        });
      }
    }
  }
  u.x = nx;
  u.y = ny;
  addFatigue(s, u, (0.2 * dist) / 100);
  frames.paths.get(u.uid)?.push({ x: nx, y: ny, angle: u.angle });

  // §4.3.7.2 — pursuers
  for (const euid of u.engaged) {
    const e = unitByUid(s, euid);
    if (!e || e.removed || e.fled || e.status !== "normal") continue;
    if (!rng.chance(trainingStat(e) / 6)) {
      e.status = "pursuing";
      e.pursuitTarget = u.uid;
      e.order = null;
      addDisorder(e, 1);
      s.events.push({
        kind: "pursuit",
        text: `The ${UNIT_DEFS[e.unit].name} of Player ${e.player + 1} lose their heads and give chase!`,
      });
      const g2 = s.generals.find((g3) => g3.attachedTo === e.uid);
      if (g2) detachGeneralInPlace(s, g2, e);
    }
  }
  u.engaged = [];
}

/* ---------- generals (§4.4) ---------- */

function generalCasualtyRoll(s: BattleState, rng: Rng, u: BattleUnit): void {
  const g = s.generals.find(
    (g2) => (g2.attachedTo === u.uid || g2.unitUid === u.uid) && g2.condition === "fighting",
  );
  if (!g) return;
  if (rng.d6() === 1) {
    g.condition = "dead";
    s.generalFallenCheck[(1 - g.player) as PlayerId] = false;
    s.generalFallenCheck[g.player] = true;
    const gx = generalPosition(s, g);
    g.x = gx[0];
    g.y = gx[1];
    s.events.push({
      kind: "general-death",
      text: `${GENERAL_DEFS[g.general].name} falls amid the fighting! His army wavers.`,
    });
  }
}

function detachGeneralInPlace(s: BattleState, g: BattleGeneral, host: BattleUnit): void {
  void host;
  detachGeneralFrom(s, g.player); // §4.4 — he stays where the unit left him
}

function generalUnitLost(s: BattleState, g: BattleGeneral, unit: BattleUnit): void {
  // §4.4 — his personal unit broke or died: he flees or dies
  g.x = unit.x;
  g.y = unit.y;
  if (unit.removed) {
    g.condition = "dead";
    s.generalFallenCheck[g.player] = true;
    s.events.push({
      kind: "general-death",
      text: `${GENERAL_DEFS[g.general].name} dies with his guard around him.`,
    });
  } else {
    g.condition = "fled";
    s.events.push({
      kind: "general-fled",
      text: `${GENERAL_DEFS[g.general].name} abandons the field — his voice now carries at half its force.`,
    });
  }
}

function generalsPhase(s: BattleState, rng: Rng): void {
  // duel (§4.4): the generals' units in front-to-front contact
  const [gA, gB] = s.generals;
  if (gA.condition === "fighting" && gB.condition === "fighting") {
    const uA = unitByUid(s, gA.attachedTo ?? gA.unitUid);
    const uB = unitByUid(s, gB.attachedTo ?? gB.unitUid);
    if (uA && uB && uA.engaged.includes(uB.uid)) {
      const arcAB = arcOfAttack(uB, uA);
      const arcBA = arcOfAttack(uA, uB);
      if (arcAB === "front" && arcBA === "front") {
        let a: number;
        let b: number;
        do {
          a = duelCharisma(gA) + rng.d6();
          b = duelCharisma(gB) + rng.d6();
        } while (a === b);
        const loser = a > b ? gB : gA;
        const winner = a > b ? gA : gB;
        loser.condition = "dead";
        s.generalFallenCheck[loser.player] = true;
        s.events.push({
          kind: "duel",
          text: `${GENERAL_DEFS[winner.general].name} and ${GENERAL_DEFS[loser.general].name} meet blade to blade — ${GENERAL_DEFS[loser.general].name} is cut down!`,
        });
      }
    }
  }
}

function duelCharisma(g: BattleGeneral): number {
  const def = GENERAL_DEFS[g.general];
  return def.duelCharisma ?? def.charisma;
}

/* ---------- fatigue, recovery (§4.3.3, §4.3.8) ---------- */

function addFatigue(s: BattleState, u: BattleUnit, amount: number): void {
  void s;
  const before = fatigueLevels(u);
  u.fatigueSpent = Math.min(enduranceOf(u), u.fatigueSpent + amount);
  // a 4th level while already at 3: forced halt next phase, stay capped (§4.3.6)
  if (before >= 3 && u.fatigueSpent >= enduranceOf(u)) u.restingForced = true;
  u.fatigue = fatigueLevels(u);
}

function addDisorder(u: BattleUnit, n: number): void {
  if (u.status === "pursuing") {
    u.disorder = Math.min(3, u.disorder + n); // pursuers never stop anyway
    return;
  }
  u.disorder = Math.min(3, u.disorder + n);
}

function fatigueFromCombat(s: BattleState): void {
  for (const u of liveUnits(s)) {
    if (u.engaged.length > 0) addFatigue(s, u, 1); // §4.3.3
  }
}

function recoveryPhase(s: BattleState, rng: Rng): void {
  for (const u of liveUnits(s)) {
    if (u.order?.type !== "wait") continue;
    const o = u.order;
    u.waitBank += o.pct;
    while (u.waitBank >= 100) {
      u.waitBank -= 100;
      // §4.3.8 recovery bundle
      if (u.disorder > 0) u.disorder--;
      if (u.disorder > 0 && rng.chance(trainingStat(u) / 6)) u.disorder--;
      u.fatigueSpent = Math.max(0, u.fatigueSpent - enduranceOf(u) * 0.25);
      u.fatigue = fatigueLevels(u);
      if (u.morale < 3 && rng.chance(moraleStat(s, u) / 6)) u.morale++;
    }
    const done =
      o.until.length > 0 &&
      o.until.every((c) =>
        c === "disorder" ? u.disorder === 0 : c === "fatigue" ? fatigueLevels(u) === 0 : u.morale >= 3,
      );
    if (o.until.length === 0 || done) u.order = null; // one-shot unless conditioned
  }
}

/* ---------- endgame (§4.5, §5) ---------- */

function endgameChecks(s: BattleState, rng: Rng): void {
  // §4.5.1.1 — the fallen-general morale test
  for (const p of [0, 1] as PlayerId[]) {
    if (!s.generalFallenCheck[p]) continue;
    s.generalFallenCheck[p] = false;
    const g = generalOf(s, p);
    for (const u of liveUnits(s, p)) {
      if (u.status !== "normal") continue;
      const near = Math.hypot(u.x - g.x, u.y - g.y) <= GLANCE_RADIUS;
      let pRout = 0.75 / Math.max(0.5, moraleStat(s, u));
      if (near) pRout *= 2;
      if (rng.chance(Math.min(0.95, pRout))) {
        u.morale = 0;
      }
    }
    s.events.push({
      kind: "info",
      text: `Word spreads through Player ${p + 1}'s ranks: the general is gone. Knees buckle.`,
    });
  }

  // §4.5.1.2 — sacking
  for (const p of [0, 1] as PlayerId[]) {
    const enemy = (1 - p) as PlayerId;
    const inside = liveUnits(s, enemy).filter((u) => inCamp(p, u.x, u.y) && u.status !== "routing");
    if (inside.length >= 3 && !s.campSacked[p]) {
      s.campSacked[p] = true;
      for (const u of inside) {
        u.status = "sacking";
        u.disorder = 3;
        u.order = null;
      }
      s.events.push({
        kind: "sack",
        text: `Player ${enemy + 1}'s soldiers pour into the enemy camp and fall to plunder! Player ${p + 1}'s army despairs.`,
      });
    }
  }

  // §4.5.2 — victory conditions
  const bar = victoryBar(s);
  const intactA = armyIntactFraction(s, 0);
  const intactB = armyIntactFraction(s, 1);

  let winner: PlayerId | null = null;
  let reason = "";
  if (intactA < 0.25 && intactB < 0.25) {
    s.draw = true;
    reason = "Both armies have dissolved — the field belongs to the crows.";
  } else if (intactA < 0.25) {
    winner = 1;
    reason = "Over three quarters of Player 1's army has fled or fallen.";
  } else if (intactB < 0.25) {
    winner = 0;
    reason = "Over three quarters of Player 2's army has fled or fallen.";
  } else if (bar >= 100) {
    winner = 0;
    reason = "Player 1's dominance is total.";
  } else if (bar <= -100) {
    winner = 1;
    reason = "Player 2's dominance is total.";
  } else if (s.turn >= 30) {
    if (bar >= 25) {
      winner = 0;
      reason = "Thirty turns of blood — Player 1 holds the upper hand.";
    } else if (bar <= -25) {
      winner = 1;
      reason = "Thirty turns of blood — Player 2 holds the upper hand.";
    } else {
      s.draw = true;
      reason = "Thirty turns, and neither army will yield. A bitter draw.";
    }
  }

  if (winner !== null || s.draw) {
    finishBattle(s, winner, reason);
  }
}

/** §5 — Because fuck Ptolemy. */
export function finishBattle(s: BattleState, winner: PlayerId | null, reason: string): void {
  if (winner !== null && s.musters[winner].general === "ptolemaios") {
    const doom = PTOLEMY_DOOMS[s.turn % PTOLEMY_DOOMS.length]!;
    s.events.push({ kind: "ptolemy", text: doom });
    for (const u of liveUnits(s, winner)) u.status = "routing";
    const other = (1 - winner) as PlayerId;
    if (s.musters[other].general === "ptolemaios") {
      // two Ptolemies: the gods strike both. A perfect draw.
      s.winner = null;
      s.draw = true;
      s.finishReason = "Both Ptolemies perished at the moment of triumph. The gods are just.";
    } else {
      s.winner = other;
      s.finishReason = `${reason} …or so it seemed, before the gods intervened.`;
    }
  } else {
    s.winner = winner;
    s.draw = winner === null;
    s.finishReason = reason;
  }
  s.finished = true;
  s.events.push({
    kind: "victory",
    text: s.draw
      ? s.finishReason
      : `Victory for Player ${(s.winner ?? 0) + 1}! ${s.finishReason}`,
  });
}

const PTOLEMY_DOOMS = [
  "Ptolemaios self-combusted and instantly died. Fuck you, Ptolemy.",
  "A bolt from a cloudless sky strikes Ptolemaios dead where he stands. The gods send no apology.",
  "A piano — an instrument that will not be invented for two thousand years — falls from the heavens onto Ptolemaios. Historians remain baffled.",
  "Ptolemaios chokes on a celebratory fig. The fig is later honoured with a small shrine.",
];

/* ---------- helpers ---------- */

function nearestTarget(s: BattleState, u: BattleUnit, uids: number[]): BattleUnit | null {
  let best: BattleUnit | null = null;
  let bestD = Infinity;
  for (const uid of uids) {
    const t = unitByUid(s, uid);
    if (!t || t.removed || t.fled) continue;
    const d = Math.hypot(t.x - u.x, t.y - u.y);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

function nearestEnemy(s: BattleState, u: BattleUnit): BattleUnit | null {
  let best: BattleUnit | null = null;
  let bestD = Infinity;
  for (const e of liveUnits(s, (1 - u.player) as PlayerId)) {
    const d = Math.hypot(e.x - u.x, e.y - u.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function normAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function padFrames(frames: Keyframes): void {
  for (const path of frames.paths.values()) {
    while (path.length < TICKS + 1) path.push(path[path.length - 1]!);
  }
}

/**
 * §4.2.1 — the Glance-Phase preview: simulate the coming Battle Phase on
 * a throwaway clone (movement is deterministic given the orders, so the
 * projected paths and collisions are faithful) without touching the real
 * state or consuming the match RNG.
 */
export function previewBattlePhase(s: BattleState): Keyframes {
  const clone: BattleState = structuredClone({
    ...s,
    events: [],
    fx: [],
    log: [],
  });
  const previewRng = new Rng((s.turn * 2654435761) >>> 0);
  return resolveBattlePhase(clone, previewRng);
}
