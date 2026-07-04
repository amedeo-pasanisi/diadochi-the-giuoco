import type { GeneralDef } from "../../engine/types";

/**
 * Coin-style general portraits (§6: coin art is reserved for generals).
 * A bronze tetradrachm with a profile bust; headgear varies per Diadoch.
 */

const BUST = "#2b1c0e";

/** Greek-caps legend for the coin rim. */
const LEGENDS: Record<string, string> = {
  seleukos: "ΣΕΛΕΥΚΟΥ ΝΙΚΑΤΟΡΟΣ",
  antigonos: "ΑΝΤΙΓΟΝΟΥ ΜΟΝΟΦΘΑΛΜΟΥ",
  ptolemaios: "ΠΤΟΛΕΜΑΙΟΥ ΣΩΤΗΡΟΣ",
  eumenes: "ΕΥΜΕΝΟΥΣ ΚΑΡΔΙΑΝΟΥ",
};

function headgear(id: GeneralDef["id"]): string {
  switch (id) {
    case "seleukos":
      // Attic helmet with a bull's horn
      return `
        <path d="M72 76 Q74 50 100 46 Q124 44 130 64 L132 78 Q118 68 96 70 Q80 72 72 84 Z" fill="${BUST}"/>
        <path d="M104 48 Q116 40 130 44 Q122 50 116 56 Z" fill="${BUST}"/>`;
    case "antigonos":
      // plain diadem + the famous missing eye (a strap across it)
      return `
        <path d="M72 76 Q94 62 130 70" stroke="${BUST}" stroke-width="6" fill="none"/>
        <path d="M104 60 L138 84" stroke="#c8a561" stroke-width="5" stroke-linecap="round"/>`;
    case "ptolemaios":
      // diadem with trailing ends and curls
      return `
        <path d="M72 74 Q96 60 130 68" stroke="${BUST}" stroke-width="5.5" fill="none"/>
        <path d="M74 76 Q64 84 66 96" stroke="${BUST}" stroke-width="3.5" fill="none"/>
        <circle cx="84" cy="62" r="5" fill="${BUST}"/>
        <circle cx="96" cy="56" r="5" fill="${BUST}"/>
        <circle cx="110" cy="55" r="5" fill="${BUST}"/>`;
    case "eumenes":
      // kausia — the flat Macedonian cap (worn by the scholar-general)
      return `
        <ellipse cx="102" cy="56" rx="34" ry="12" fill="${BUST}"/>
        <path d="M72 60 Q100 74 132 62 L130 70 Q100 80 74 68 Z" fill="${BUST}"/>`;
  }
}

export function coinSVG(g: GeneralDef, size = 168): string {
  const legend = LEGENDS[g.id] ?? g.name.toUpperCase();
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">
  <defs>
    <radialGradient id="coin-${g.id}" cx="38%" cy="32%" r="75%">
      <stop offset="0%" stop-color="#e3c079"/>
      <stop offset="55%" stop-color="#c19a55"/>
      <stop offset="100%" stop-color="#8a672f"/>
    </radialGradient>
    <path id="rim-${g.id}" d="M 100 100 m -72 0 a 72 72 0 1 1 144 0" fill="none"/>
  </defs>
  <!-- slightly irregular flan -->
  <circle cx="100" cy="100" r="96" fill="#6e4f22"/>
  <circle cx="99" cy="99" r="93" fill="url(#coin-${g.id})"/>
  <circle cx="100" cy="100" r="84" fill="none" stroke="#6e4f22" stroke-width="2"
          stroke-dasharray="1.5 5" stroke-linecap="round"/>
  <!-- legend -->
  <text font-family="Georgia, serif" font-size="12.5" letter-spacing="1.5" fill="#5a3f18">
    <textPath href="#rim-${g.id}" startOffset="50%" text-anchor="middle">${legend}</textPath>
  </text>
  <!-- bust: neck/shoulder, head profile facing right -->
  <path d="M74 168 Q76 138 82 118 L84 100
           Q78 96 79 84 Q80 66 98 60 Q116 56 124 68
           L130 80 Q136 84 132 88 L130 90
           Q134 94 130 97 Q134 101 129 106
           L124 112 Q118 118 112 118
           L116 132 Q120 146 126 168
           Q100 178 74 168 Z" fill="${BUST}"/>
  ${headgear(g.id)}
</svg>`;
}
