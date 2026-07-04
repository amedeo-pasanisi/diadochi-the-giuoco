import type { UnitDef } from "../../engine/types";

/**
 * Procedural black-figure silhouettes for unit cards (§6: cards are
 * red-ground with black figures, inverted from the general UI).
 * Placeholder art: the Unity build will swap in hand-made pieces, so
 * everything here stays behind `unitArtSVG(def)`.
 */

const FIG = "#16100a"; // figure black
const CUT = "#b45f2c"; // card-red, used to "cut" shapes out of silhouettes

function line(x1: number, y1: number, x2: number, y2: number, w: number, color = FIG): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
}
function circle(cx: number, cy: number, r: number, color = FIG): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
}
function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, color = FIG): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="${color}"/>`;
}
function poly(points: [number, number][], color = FIG): string {
  return `<polygon points="${points.map((p) => p.join(",")).join(" ")}" fill="${color}"/>`;
}
function path(d: string, w: number, color = FIG, fill = "none"): string {
  return `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="${fill}" stroke-linecap="round"/>`;
}

interface WarriorOpts {
  crest?: boolean;
  doubleCrest?: boolean;
  shield?: "hoplon" | "pelta" | "thureos" | "none";
  weapon: "pike" | "spear" | "javelin" | "bow" | "sling" | "sword";
  running?: boolean;
}

/** A foot soldier facing right, feet on y=105. */
function warrior(x: number, o: WarriorOpts): string {
  const parts: string[] = [];
  const spread = o.running ? 14 : 9;
  // legs
  parts.push(path(`M ${x - spread} 105 L ${x} 81 L ${x + spread} 105`, 5.5));
  // torso
  parts.push(line(x, 82, x + 1, 57, 8));
  // head
  parts.push(circle(x + 2, 48, 6.5));
  // helmet crest
  if (o.crest || o.doubleCrest) {
    parts.push(path(`M ${x - 8} 45 Q ${x + 2} 30 ${x + 13} 44`, 5));
    if (o.doubleCrest) parts.push(path(`M ${x - 10} 49 Q ${x + 2} 36 ${x + 15} 48`, 3));
  }
  // weapon
  switch (o.weapon) {
    case "pike":
      parts.push(line(x - 8, 86, x + 46, 32, 2.6));
      parts.push(line(x - 3, 74, x + 12, 62, 4)); // gripping arms
      break;
    case "spear":
      parts.push(line(x - 12, 42, x + 30, 74, 2.6)); // overhead thrust
      parts.push(line(x + 1, 58, x - 7, 46, 4)); // raised arm
      break;
    case "javelin":
      parts.push(line(x - 4, 56, x + 8, 44, 4)); // throwing arm
      parts.push(line(x - 2, 48, x + 32, 36, 2.2));
      break;
    case "bow": {
      const bx = x + 15;
      parts.push(path(`M ${bx} 44 Q ${bx + 13} 66 ${bx} 88`, 2.6));
      parts.push(line(bx, 44, bx, 88, 1.4));
      parts.push(line(x - 2, 66, bx + 10, 66, 2)); // arrow
      parts.push(line(x + 1, 62, bx, 66, 4)); // arm
      break;
    }
    case "sling":
      parts.push(line(x + 1, 58, x + 10, 46, 4));
      parts.push(path(`M ${x + 2} 50 Q ${x + 18} 28 ${x + 32} 46`, 2.2));
      parts.push(circle(x + 32, 47, 3));
      break;
    case "sword":
      parts.push(line(x + 2, 60, x + 22, 46, 3.5));
      break;
  }
  // shield (drawn last, in front of the body)
  switch (o.shield) {
    case "hoplon":
      parts.push(circle(x + 11, 70, 11.5));
      parts.push(circle(x + 11, 70, 4, CUT));
      break;
    case "pelta":
      parts.push(circle(x + 12, 70, 9.5));
      parts.push(circle(x + 17, 66, 7.5, CUT)); // crescent bite
      break;
    case "thureos":
      parts.push(ellipse(x + 11, 72, 7, 14.5));
      parts.push(line(x + 11, 60, x + 11, 84, 1.6, CUT)); // spine
      break;
  }
  return parts.join("");
}

interface RiderOpts {
  crest?: boolean;
  weapon: "lance" | "lanceUp" | "javelin" | "bow" | "none";
  shield?: boolean;
}

/** Horse + rider facing right, hooves on y=105, ~86 wide from x. */
function horseman(x: number, o: RiderOpts): string {
  const parts: string[] = [];
  // tail
  parts.push(path(`M ${x + 5} 66 Q ${x - 5} 78 ${x - 1} 95`, 3.5));
  // legs
  parts.push(line(x + 13, 78, x + 8, 105, 4.5));
  parts.push(line(x + 21, 80, x + 19, 105, 4.5));
  parts.push(line(x + 43, 80, x + 45, 105, 4.5));
  parts.push(line(x + 51, 77, x + 56, 105, 4.5));
  // body
  parts.push(ellipse(x + 31, 71, 26, 13));
  // neck + head
  parts.push(poly([[x + 48, 66], [x + 60, 37], [x + 71, 42], [x + 55, 74]]));
  parts.push(poly([[x + 59, 34], [x + 68, 30], [x + 82, 43], [x + 63, 49]]));
  parts.push(line(x + 63, 32, x + 60, 25, 2.5)); // ear
  // rider: leg, torso, head
  parts.push(line(x + 31, 60, x + 34, 78, 5));
  parts.push(line(x + 31, 60, x + 35, 41, 7));
  parts.push(circle(x + 37, 34, 5.5));
  if (o.crest) parts.push(path(`M ${x + 29} 31 Q ${x + 37} 18 ${x + 47} 30`, 4.5));
  switch (o.weapon) {
    case "lance": // couched xyston
      parts.push(line(x + 12, 52, x + 74, 26, 2.6));
      parts.push(line(x + 35, 46, x + 46, 40, 3.5));
      break;
    case "lanceUp":
      parts.push(line(x + 44, 62, x + 56, 6, 2.4));
      parts.push(line(x + 36, 46, x + 48, 44, 3.5));
      break;
    case "javelin":
      parts.push(line(x + 36, 44, x + 46, 32, 3.5));
      parts.push(line(x + 32, 36, x + 62, 24, 2));
      break;
    case "bow": {
      const bx = x + 50;
      parts.push(path(`M ${bx} 22 Q ${bx + 11} 38 ${bx} 54`, 2.2));
      parts.push(line(bx, 22, bx, 54, 1.2));
      parts.push(line(x + 36, 38, bx + 8, 38, 1.8));
      parts.push(line(x + 36, 42, bx - 2, 38, 3.5));
      break;
    }
  }
  if (o.shield) parts.push(circle(x + 26, 52, 8));
  return parts.join("");
}

function elephant(): string {
  const parts: string[] = [];
  // legs
  for (const lx of [74, 89, 108, 123] as const) {
    parts.push(`<rect x="${lx}" y="82" width="10" height="23" fill="${FIG}"/>`);
  }
  // body + head
  parts.push(ellipse(100, 68, 35, 23));
  parts.push(circle(139, 60, 15));
  parts.push(path(`M 150 52 Q 164 68 155 92 Q 153 98 148 95`, 6));
  // tusk (cut-color so it reads against the body)
  parts.push(line(143, 72, 158, 79, 2.6, CUT));
  // eye
  parts.push(circle(141, 55, 1.8, CUT));
  // tail
  parts.push(line(66, 58, 57, 78, 3));
  // mahout
  parts.push(line(104, 46, 106, 34, 5.5));
  parts.push(circle(107, 28, 4.5));
  parts.push(line(108, 34, 124, 22, 1.8)); // goad
  return parts.join("");
}

function chariot(): string {
  const parts: string[] = [];
  // horses (two, slightly offset)
  parts.push(`<g opacity="0.8" transform="translate(6,-4)">${chariotHorse(118)}</g>`);
  parts.push(chariotHorse(112));
  // pole
  parts.push(line(104, 74, 138, 66, 3));
  // wheel with cut spokes and scythes
  parts.push(circle(88, 88, 16));
  parts.push(line(88, 74, 88, 102, 2.2, CUT));
  parts.push(line(74, 88, 102, 88, 2.2, CUT));
  parts.push(circle(88, 88, 2.5, CUT));
  parts.push(path(`M 88 88 Q 110 94 118 106`, 3.2));
  parts.push(path(`M 88 88 Q 68 96 60 106`, 3.2));
  // cab
  parts.push(path(`M 72 72 Q 70 50 86 48 L 102 48 L 104 74 Z`, 2.5, FIG, FIG));
  // driver
  parts.push(line(90, 46, 90, 36, 6));
  parts.push(circle(91, 29, 5));
  parts.push(line(94, 36, 116, 24, 1.8)); // whip
  return parts.join("");
}

function chariotHorse(x: number): string {
  const parts: string[] = [];
  parts.push(line(x + 8, 76, x + 4, 105, 4));
  parts.push(line(x + 16, 78, x + 15, 105, 4));
  parts.push(line(x + 33, 78, x + 35, 105, 4));
  parts.push(line(x + 40, 75, x + 45, 105, 4));
  parts.push(ellipse(x + 24, 70, 21, 11));
  parts.push(poly([[x + 38, 64], [x + 48, 40], [x + 57, 45], [x + 44, 72]]));
  parts.push(poly([[x + 47, 37], [x + 55, 34], [x + 66, 45], [x + 50, 50]]));
  return parts.join("");
}

/** Groundline + frame shared by all cards. */
function stage(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" preserveAspectRatio="xMidYMax meet">
    <rect x="6" y="105" width="188" height="3.2" fill="${FIG}"/>
    ${inner}
  </svg>`;
}

export function unitArtSVG(def: UnitDef): string {
  switch (def.id) {
    case "pezhetairoi":
      return stage(
        [34, 88, 142].map((x) => warrior(x, { weapon: "pike", shield: "none", crest: false })).join("") +
          warrior(34, { weapon: "pike" }) /* densify front */,
      );
    case "hoplitai":
      return stage([40, 100, 160].map((x) => warrior(x, { weapon: "spear", shield: "hoplon" })).join(""));
    case "hypaspistai":
      return stage(
        [40, 100, 160].map((x) => warrior(x, { weapon: "spear", shield: "hoplon", crest: true, doubleCrest: true })).join(""),
      );
    case "thureophoroi":
      return stage([40, 100, 160].map((x) => warrior(x, { weapon: "javelin", shield: "thureos" })).join(""));
    case "peltastai":
      return stage(
        [40, 100, 160].map((x) => warrior(x, { weapon: "javelin", shield: "pelta", running: true })).join(""),
      );
    case "toxotai":
      return stage([36, 96, 156].map((x) => warrior(x, { weapon: "bow", shield: "none" })).join(""));
    case "sphendonetai":
      return stage(
        [36, 96, 156].map((x) => warrior(x, { weapon: "sling", shield: "none", running: true })).join(""),
      );
    case "hetairoi":
      return stage([12, 104].map((x) => horseman(x, { weapon: "lance", crest: true })).join(""));
    case "thessaloi":
      return stage([12, 104].map((x) => horseman(x, { weapon: "lance" })).join(""));
    case "prodromoi":
      return stage([12, 104].map((x) => horseman(x, { weapon: "lanceUp" })).join(""));
    case "hippeis":
      return stage([12, 104].map((x) => horseman(x, { weapon: "lance", shield: true })).join(""));
    case "tarantinoi":
      return stage([12, 104].map((x) => horseman(x, { weapon: "javelin", shield: true })).join(""));
    case "hippotoxotai":
      return stage([12, 104].map((x) => horseman(x, { weapon: "bow" })).join(""));
    case "elephantes":
      return stage(elephant());
    case "drepanephoroi":
      return stage(chariot());
  }
}
