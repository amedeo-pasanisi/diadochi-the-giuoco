import type { GeneralDef, GeneralId } from "../types";

/**
 * The four Diadochi (§1.5–1.7).
 * On the battlefield a general fights with the profile of a Hetairoi unit.
 */
export const GENERAL_DEFS: Record<GeneralId, GeneralDef> = {
  seleukos: {
    id: "seleukos",
    name: "Seleukos",
    epithet: "Nikator — the Victor",
    role: "Master of the east. Methodical, far-seeing, and patient enough to win everything back twice.",
    cost: 50,
    command: 3,
    glance: 2,
    brilliancy: 3,
    charisma: 2,
  },
  antigonos: {
    id: "antigonos",
    name: "Antigonos",
    epithet: "Monophthalmos — the One-Eyed",
    role: "The old lion. One eye, boundless ambition, and soldiers who would die for him.",
    cost: 50,
    command: 2,
    glance: 3,
    brilliancy: 2,
    charisma: 3,
  },
  ptolemaios: {
    id: "ptolemaios",
    name: "Ptolemaios",
    epithet: "Soter — the so-called Saviour",
    role: "Satrap of Egypt. Cautious, wealthy, unremarkable in the field. The gods are watching him.",
    cost: 36,
    command: 2,
    glance: 2,
    brilliancy: 2,
    charisma: 2,
    doomed: true,
  },
  eumenes: {
    id: "eumenes",
    name: "Eumenes",
    epithet: "of Kardia — the Scholar",
    role: "The Greek secretary who out-generaled the Macedonians. Brilliant, and resented for it.",
    cost: 50,
    command: 3,
    glance: 3,
    brilliancy: 3,
    charisma: 1,
    duelCharisma: 2,
  },
};

export const GENERAL_ORDER: GeneralId[] = [
  "seleukos",
  "antigonos",
  "ptolemaios",
  "eumenes",
];
