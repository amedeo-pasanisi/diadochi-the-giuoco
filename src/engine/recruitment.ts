import type { GeneralId, UnitId } from "./types";
import { UNIT_DEFS } from "./data/units";
import { GENERAL_DEFS } from "./data/generals";

/** §1.8 — each player musters an army worth up to 150 talents. */
export const TALENT_BUDGET = 150;
/** §1.8 — absolute cap on copies of the same unit. */
export const GLOBAL_UNIT_CAP = 8;
/** §1.8 — copies beyond the fourth cost 20% more, rounded to an integer. */
export const INFLATION_AFTER = 4;
export const INFLATION_FACTOR = 1.2;

/** §1.9 / §2.4 / §3.7 — phase timers, in seconds. */
export const ARMY_SELECT_SECONDS = 180;
export const BATTLEFIELD_SELECT_SECONDS = 45;
export const DEPLOY_SECONDS = 180;

/**
 * A player's muster. Plain serializable data: this object is what a
 * remote client or an AI seat would send over the wire.
 */
export interface SelectionState {
  counts: Partial<Record<UnitId, number>>;
  general: GeneralId | null;
}

export type SelectionAction =
  | { type: "addUnit"; unit: UnitId }
  | { type: "removeUnit"; unit: UnitId }
  | { type: "setGeneral"; general: GeneralId | null };

export function emptySelection(): SelectionState {
  return { counts: {}, general: null };
}

/** Cost of the n-th copy (1-based) of a unit. */
export function copyCost(unit: UnitId, copyIndex: number): number {
  const base = UNIT_DEFS[unit].cost;
  return copyIndex > INFLATION_AFTER ? Math.round(base * INFLATION_FACTOR) : base;
}

/** Talents spent on `count` copies of a unit, inflation included. */
export function unitSpend(unit: UnitId, count: number): number {
  let total = 0;
  for (let i = 1; i <= count; i++) total += copyCost(unit, i);
  return total;
}

export function unitCap(unit: UnitId): number {
  return Math.min(UNIT_DEFS[unit].max ?? GLOBAL_UNIT_CAP, GLOBAL_UNIT_CAP);
}

export function totalSpent(sel: SelectionState): number {
  let total = sel.general ? GENERAL_DEFS[sel.general].cost : 0;
  for (const [unit, count] of Object.entries(sel.counts)) {
    total += unitSpend(unit as UnitId, count ?? 0);
  }
  return total;
}

export function remainingTalents(sel: SelectionState): number {
  return TALENT_BUDGET - totalSpent(sel);
}

export function unitCount(sel: SelectionState, unit: UnitId): number {
  return sel.counts[unit] ?? 0;
}

export function armySize(sel: SelectionState): number {
  return Object.values(sel.counts).reduce((a, b) => a + (b ?? 0), 0);
}

/** Cost the next copy of this unit would have, or null if the cap is reached. */
export function nextCopyCost(sel: SelectionState, unit: UnitId): number | null {
  const n = unitCount(sel, unit) + 1;
  return n > unitCap(unit) ? null : copyCost(unit, n);
}

export function canAddUnit(sel: SelectionState, unit: UnitId): boolean {
  const cost = nextCopyCost(sel, unit);
  return cost !== null && cost <= remainingTalents(sel);
}

export function canSetGeneral(sel: SelectionState, general: GeneralId): boolean {
  if (sel.general === general) return true;
  const current = sel.general ? GENERAL_DEFS[sel.general].cost : 0;
  return GENERAL_DEFS[general].cost <= remainingTalents(sel) + current;
}

/**
 * Pure reducer. Illegal actions return the state unchanged, so a
 * malicious or buggy client can never corrupt a muster.
 */
export function applySelectionAction(
  sel: SelectionState,
  action: SelectionAction,
): SelectionState {
  switch (action.type) {
    case "addUnit": {
      if (!canAddUnit(sel, action.unit)) return sel;
      return {
        ...sel,
        counts: { ...sel.counts, [action.unit]: unitCount(sel, action.unit) + 1 },
      };
    }
    case "removeUnit": {
      const n = unitCount(sel, action.unit);
      if (n <= 0) return sel;
      const counts = { ...sel.counts };
      if (n === 1) delete counts[action.unit];
      else counts[action.unit] = n - 1;
      return { ...sel, counts };
    }
    case "setGeneral": {
      if (action.general !== null && !canSetGeneral(sel, action.general)) return sel;
      return { ...sel, general: action.general };
    }
  }
}

/**
 * Timer expiry (§1.9): the player marches with whatever they have.
 * A general is required by the battlefield-selection contest (§2.1), so
 * if none was appointed we appoint the cheapest affordable one, removing
 * the most recently priced-up units if we must free the talents.
 * Returns null only for an empty muster — an automatic defeat.
 */
export function finalizeOnTimeout(sel: SelectionState): SelectionState | null {
  if (armySize(sel) === 0) return null;
  if (sel.general) return sel;

  const cheapest = Object.values(GENERAL_DEFS).reduce((a, b) =>
    b.cost < a.cost ? b : a,
  );
  let current = sel;
  while (remainingTalents(current) < cheapest.cost && armySize(current) > 1) {
    // Shed the most expensive next-to-refund copy until the general fits.
    const owned = Object.keys(current.counts) as UnitId[];
    const priciest = owned.reduce((a, b) =>
      copyCost(b, unitCount(current, b)) > copyCost(a, unitCount(current, a)) ? b : a,
    );
    current = applySelectionAction(current, { type: "removeUnit", unit: priciest });
  }
  if (remainingTalents(current) >= cheapest.cost) {
    current = applySelectionAction(current, { type: "setGeneral", general: cheapest.id });
  }
  return current;
}
