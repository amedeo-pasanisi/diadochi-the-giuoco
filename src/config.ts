/**
 * Development toggles.
 *
 * ENFORCE_TIMERS — when true, phase timers have their designed effects
 * (auto-march on expiry, automatic defeat on an empty muster, turn
 * passing to the opponent, §1.9/§2.4/§3.7/§4.1.3). When false the
 * countdown still displays but expiry does nothing, so players can
 * explore at leisure. Flip to true before release.
 */
export const ENFORCE_TIMERS = false;
