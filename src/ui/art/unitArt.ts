import type { UnitDef } from "../../engine/types";

/**
 * Procedural vase-style unit art — one subject per card, black-figure
 * manner: solid black silhouette with "incised" interior lines in the
 * ground colour, plus sparing added-white details, as on Attic pottery.
 * Placeholder for hand-made art in the Unity build; everything stays
 * behind `unitArtSVG(def)`.
 */

const FIG = "#16100a"; // figure black
const CUT = "#b45f2c"; // ground red — incision lines cut through the black
const CREAM = "#e7d5a9"; // added white (shield blazons, tusks)

/* ---------- tiny svg helpers ---------- */

function line(x1: number, y1: number, x2: number, y2: number, w: number, color = FIG): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
}
function circle(cx: number, cy: number, r: number, color = FIG): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
}
function ring(cx: number, cy: number, r: number, w: number, color = CUT): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
}
function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, color = FIG): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="${color}"/>`;
}
function poly(points: [number, number][], color = FIG): string {
  return `<polygon points="${points.map((p) => p.join(",")).join(" ")}" fill="${color}"/>`;
}
function fill(d: string, color = FIG): string {
  return `<path d="${d}" fill="${color}"/>`;
}
function stroke(d: string, w: number, color = FIG): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
}

/* ---------- foot-soldier anatomy (canonical figure, hip ≈ x 86, ground y 138) ---------- */

/** Striding legs: front leg planted forward, rear leg trailing, heel up. */
function legsStride(): string {
  const front = fill(
    `M 92 76 Q 102 86 103 101 Q 108 112 104 124 L 117 131 L 118 136 L 100 136
     Q 98 130 98 124 Q 94 116 92 103 Q 86 92 80 82 Z`,
  );
  const rear = fill(
    `M 80 78 Q 72 88 66 98 Q 58 108 56 120 L 46 128 L 64 137 L 68 132
     Q 64 126 63 119 Q 67 110 73 100 Q 79 88 87 80 Z`,
  );
  // knee + calf incisions
  const cuts =
    stroke("M 99 103 Q 102 105 100 108", 1.2, CUT) + stroke("M 65 99 Q 68 101 66 105", 1.2, CUT);
  return rear + front + cuts;
}

/** Standing legs, both planted. */
function legsStand(): string {
  const front = fill(
    `M 90 76 Q 99 88 99 102 Q 101 116 99 128 L 112 133 L 113 137 L 96 137
     Q 93 122 91 108 Q 86 90 82 80 Z`,
  );
  const rear = fill(
    `M 82 78 Q 76 90 76 102 Q 74 116 75 130 L 62 134 L 61 137 L 78 137
     Q 80 122 81 108 Q 84 92 88 78 Z`,
  );
  return rear + front + stroke("M 95 104 Q 98 106 96 110", 1.2, CUT);
}

/** Running legs, long reach, rear foot lifting. */
function legsRun(): string {
  const front = fill(
    `M 92 74 Q 106 82 112 96 Q 118 108 120 122 L 133 128 L 134 133 L 115 133
     Q 111 118 105 106 Q 95 90 82 80 Z`,
  );
  const rear = fill(
    `M 80 76 Q 68 84 60 94 Q 50 104 44 116 L 32 122 L 44 131 L 50 126
     Q 55 114 63 104 Q 73 92 86 82 Z`,
  );
  return rear + front + stroke("M 108 98 Q 111 100 109 104", 1.2, CUT);
}

/** Profile torso, chest to the right, with pectoral/abdomen incisions. */
function torso(): string {
  return (
    fill(
      `M 78 42 Q 70 50 71 62 Q 72 74 78 80 L 94 78 Q 92 68 94 60 Q 98 50 92 42 Q 85 38 78 42 Z`,
    ) +
    circle(85, 47, 6.5) +
    stroke("M 88 53 Q 94 57 90 61", 1.2, CUT) +
    stroke("M 87 63 Q 90 68 87 74", 1.2, CUT)
  );
}

function armSeg(x1: number, y1: number, x2: number, y2: number, w: number): string {
  // shoulder cap so arms join the torso with mass instead of a bare line
  return circle(x1, y1, w * 0.62) + line(x1, y1, x2, y2, w);
}
function hand(x: number, y: number): string {
  return circle(x, y, 4.2);
}

/* ---------- heads ---------- */

/** Corinthian helmet in profile, optional high crest. */
function headCorinthian(crest: boolean): string {
  let s = fill(
    `M 79 40 Q 74 32 76 22 Q 80 11 90 10 Q 99 11 102 20 L 104 30 Q 104 36 100 42 L 94 46 L 84 46 Q 80 44 79 40 Z`,
  );
  // T-shaped eye slot incision
  s += line(95, 27, 102.5, 27, 2, CUT) + line(99, 27, 99, 34, 1.6, CUT);
  if (crest) {
    s += line(90, 10, 88, 3, 2.6); // crest support
    s += fill(`M 98 14 Q 86 -3 64 6 Q 59 10 63 15 Q 81 4 95 19 Z`);
    s += stroke("M 66 9 Q 83 2 96 16", 1, CUT);
  }
  return s;
}

/** Bare profile face with hair mass and fillet band. */
function headBare(): string {
  return (
    circle(88, 32, 9.5) +
    fill(`M 92 24 Q 100 26 101 34 L 104 38 L 100 40 L 99 44 Q 93 46 87 44 L 86 40 Z`) +
    line(80, 28, 97, 25, 1.4, CUT)
  );
}

/** Pilos — the pointed felt cone. */
function headPilos(): string {
  return (
    fill(`M 80 31 Q 90 -2 100 31 L 80 31 Z`) +
    fill(`M 80 31 L 100 31 L 102 36 Q 98 44 90 45 Q 83 44 80 40 Z`) +
    fill(`M 100 33 Q 104 35 103 39 L 99 40 Z`) // nose
  );
}

/** Soft Scythian/Phrygian cap with forward-flopping point. */
function headCap(): string {
  return (
    fill(`M 79 34 Q 77 20 86 15 Q 96 11 102 19 Q 108 15 112 19 Q 109 25 103 27 L 102 34 Q 96 42 86 42 Q 80 40 79 34 Z`) +
    fill(`M 100 32 Q 105 34 104 38 L 99 39 Z`)
  );
}

/* ---------- shields & weapons ---------- */

function hoplon(blazon: "star" | "lambda" = "star"): string {
  let s = circle(117, 74, 27) + ring(117, 74, 22.5, 1.4);
  if (blazon === "star") {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      s += line(
        117 + Math.cos(a) * 4,
        74 + Math.sin(a) * 4,
        117 + Math.cos(a) * 13,
        74 + Math.sin(a) * 13,
        2.2,
        CREAM,
      );
    }
    s += circle(117, 74, 2.6, CREAM);
  } else {
    s += stroke("M 108 84 L 117 62 L 126 84", 3, CREAM);
  }
  return s;
}

function pelta(): string {
  // big crescent gripped over the extended forearm
  return (
    armSeg(86, 50, 112, 60, 8) +
    fill(`M 94 46 A 27 27 0 0 1 140 72 A 46 46 0 0 0 94 46 Z`) +
    stroke("M 99 49 A 23 23 0 0 1 136 70", 1.2, CUT)
  );
}

function thureos(): string {
  return (
    ellipse(114, 86, 15, 36) +
    line(114, 54, 114, 118, 1.8, CUT) +
    ellipse(114, 84, 4, 7, 0, CUT) +
    circle(114, 84, 1.8, CREAM)
  );
}

/** Small round shield slung on the back (pikemen). */
function rondacheBack(): string {
  return ellipse(72, 58, 9, 12) + stroke("M 68 49 Q 63 58 68 68", 1.1, CUT);
}

/** Leaf-shaped spearhead at the tip of a shaft running toward (tx,ty). */
function leafhead(tx: number, ty: number, dx: number, dy: number): string {
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const bx = tx - ux * 13;
  const by = ty - uy * 13;
  return poly([
    [tx + ux * 4, ty + uy * 4],
    [bx + px * 3.6, by + py * 3.6],
    [bx - px * 3.6, by - py * 3.6],
  ]);
}

/** Overhead thrusting spear + raised arm (classic Achilles pose). */
function spearOverhead(): string {
  return (
    armSeg(84, 46, 72, 32, 8.5) +
    armSeg(72, 32, 92, 22, 7) +
    hand(94, 21) +
    line(64, 6, 152, 52, 2.4) +
    leafhead(152, 52, 88, 46)
  );
}

/** Two-handed sarissa angled up-forward. */
function pike(): string {
  return (
    line(40, 112, 172, 28, 3) +
    leafhead(172, 28, 132, -84) +
    armSeg(84, 46, 102, 72, 7.5) +
    hand(102, 72) +
    armSeg(80, 50, 116, 64, 7) +
    hand(116, 63)
  );
}

/** Javelin at full cock, about to be thrown. */
function javelinThrow(): string {
  return (
    armSeg(86, 46, 72, 30, 8.5) +
    armSeg(72, 30, 84, 18, 7) +
    hand(85, 18) +
    line(58, 26, 142, 4, 2) +
    leafhead(142, 4, 84, -22)
  );
}

/** Drawn bow, arrow nocked. */
function bowDrawn(): string {
  return (
    armSeg(86, 46, 126, 44, 6) +
    hand(128, 44) +
    armSeg(84, 46, 94, 37, 6) +
    hand(95, 36) +
    stroke("M 130 12 Q 156 44 130 78", 3) +
    stroke("M 130 12 L 95 36 L 130 78", 1.1) +
    line(95, 39, 150, 42, 1.8) +
    poly([[150, 42], [144, 39], [144, 45]]) +
    line(97, 38, 101, 35, 1) +
    line(100, 39, 104, 36, 1)
  );
}

/** Sling whirling overhead, exomis tunic knotted at the waist. */
function slingWhirl(): string {
  return (
    fill(`M 73 72 L 97 72 L 93 90 Q 86 95 77 90 Z`) + // short chiton skirt
    line(73, 73, 97, 73, 1.4, CUT) + // belt
    armSeg(84, 46, 70, 26, 8.5) +
    hand(74, 20) +
    stroke("M 74 18 Q 96 -4 118 12", 2) +
    ellipse(118, 13, 4.8, 3.4, -20) +
    armSeg(86, 50, 114, 56, 7) +
    hand(115, 56)
  );
}

/** Marching spear held upright. */
function uprightSpear(x: number): string {
  return (
    line(x, 16, x, 126, 2.4) +
    leafhead(x, 8, 0, -80) +
    armSeg(88, 48, x - 2, 58, 6) +
    hand(x, 58)
  );
}

/* ---------- horse + rider (canonical, ground y 138) ---------- */

function horse(): string {
  let s = "";
  // far legs first (visually behind)
  s += `<g transform="translate(-13,0)">${horseLegFront()}${horseLegHind()}</g>`;
  // tail
  s += fill(`M 58 62 Q 42 68 40 86 Q 38 102 46 114 Q 42 98 46 84 Q 50 70 62 70 Z`);
  // near legs
  s += horseLegFront() + horseLegHind();
  // body, neck, head, mane, ear
  s += fill(`M 58 74 Q 56 60 72 56 L 116 54 Q 132 56 134 70 Q 135 84 122 90 L 82 92 Q 62 90 58 74 Z`);
  s += fill(`M 116 54 Q 126 50 136 38 Q 141 30 148 28 L 156 36 Q 148 42 142 52 Q 136 64 130 68 L 118 64 Z`);
  s += fill(`M 120 54 Q 136 52 140 60 Q 140 70 134 76 L 122 70 Z`); // chest, closing neck into shoulder
  s += fill(`M 148 28 Q 153 22 159 24 L 174 38 Q 176 42 172 44 L 158 46 Q 152 44 148 38 Z`);
  s += fill(`M 114 52 Q 128 46 140 32 L 146 25 L 151 29 Q 139 44 126 54 Z`);
  s += poly([[151, 25], [155, 14], [160, 24]]);
  // incisions: shoulder, haunch, eye, nostril, bridle
  s += stroke("M 116 60 Q 122 70 116 82", 1.3, CUT);
  s += stroke("M 78 60 Q 70 70 76 84", 1.3, CUT);
  s += circle(160, 30, 1.6, CUT);
  s += circle(171, 40, 1.2, CUT);
  s += stroke("M 158 44 Q 164 42 170 42", 1, CUT);
  return s;
}

function horseLegFront(): string {
  return fill(
    `M 118 84 L 129 86 L 131 106 L 128 112 L 131 130 L 134 136 L 133 138 L 122 138 L 123 114 L 118 106 Z`,
  );
}
function horseLegHind(): string {
  return fill(
    `M 66 84 L 80 88 L 78 102 Q 71 110 73 118 L 76 134 L 77 138 L 66 138 L 68 118 Q 61 108 65 96 Z`,
  );
}

interface RiderOpts {
  helmet: "boeotian" | "crested" | "petasos" | "pilos" | "cap";
  cloak?: boolean;
  weapon: "xyston" | "longLance" | "spearDown" | "javelin" | "bow" | "none";
  shield?: boolean;
}

function rider(o: RiderOpts): string {
  let s = "";
  if (o.cloak) s += fill(`M 96 34 Q 78 38 70 52 Q 82 56 92 52 Q 90 42 98 38 Z`);
  // leg draped along the barrel
  s += armSeg(100, 58, 112, 76, 7) + armSeg(112, 76, 107, 96, 5);
  // torso + head
  s += armSeg(97, 56, 101, 32, 9);
  s += circle(103, 23, 6.5);
  switch (o.helmet) {
    case "boeotian":
      s += fill(`M 93 23 Q 95 13 103 12 Q 111 13 113 23 Q 108 20 103 20 Q 97 20 93 23 Z`);
      s += stroke("M 92 24 Q 103 31 114 23", 2.2);
      break;
    case "crested":
      s += fill(`M 94 22 Q 96 12 104 12 Q 112 13 113 22 L 112 26 Q 103 22 95 25 Z`);
      s += fill(`M 113 17 Q 102 2 86 9 Q 84 12 87 15 Q 99 8 111 21 Z`);
      break;
    case "petasos":
      s += ellipse(103, 18, 12, 3);
      s += fill(`M 96 18 Q 98 10 103 10 Q 109 10 110 18 Z`);
      break;
    case "pilos":
      s += fill(`M 95 20 Q 103 2 111 20 Z`);
      break;
    case "cap":
      s += fill(`M 94 22 Q 93 12 101 9 Q 109 8 112 15 Q 115 12 117 15 Q 114 20 109 20 L 108 24 Q 100 20 94 22 Z`);
      break;
  }
  switch (o.weapon) {
    case "xyston":
      s += armSeg(99, 38, 120, 44, 6) + hand(121, 45);
      s += line(66, 64, 158, 30, 2.2) + leafhead(158, 30, 92, -34);
      break;
    case "longLance":
      s += armSeg(99, 38, 118, 50, 6) + hand(119, 50);
      s += line(48, 84, 170, 24, 2.1) + leafhead(170, 24, 122, -60);
      break;
    case "spearDown":
      s += armSeg(99, 36, 90, 20, 6) + hand(90, 19);
      s += line(72, 8, 150, 62, 2.2) + leafhead(150, 62, 78, 54);
      break;
    case "javelin":
      s += armSeg(99, 36, 92, 20, 6) + hand(92, 19);
      s += line(70, 26, 140, 8, 1.9) + leafhead(140, 8, 70, -18);
      break;
    case "bow": {
      s += armSeg(100, 36, 124, 32, 6) + hand(126, 32);
      s += armSeg(99, 38, 108, 30, 6);
      s += stroke("M 128 6 Q 150 32 128 58", 2.6);
      s += stroke("M 128 6 L 108 30 L 128 58", 1);
      s += line(108, 32, 142, 31, 1.6) + poly([[142, 31], [136, 28], [136, 34]]);
      break;
    }
  }
  if (o.shield) s += circle(88, 50, 11) + ring(88, 50, 8.4, 1.1);
  return s;
}

/* ---------- specials ---------- */

function elephant(): string {
  let s = "";
  // far legs
  s += `<g transform="translate(-8,0)" opacity="0.96">${elLeg(64)}${elLeg(118)}</g>`;
  // near legs
  s += elLeg(76) + elLeg(130);
  // body + head dome
  s += fill(
    `M 44 84 Q 42 60 70 52 Q 106 42 134 50 Q 153 56 156 72 Q 158 84 151 93 L 148 98 Q 120 104 54 100 Q 46 94 44 84 Z`,
  );
  // trunk
  s += fill(`M 147 70 Q 168 82 165 106 Q 162 124 150 131 L 146 127 Q 156 116 157 102 Q 158 86 143 78 Z`);
  // tusk (added white)
  s += fill(`M 141 89 Q 152 97 161 97 Q 152 103 142 97 Z`, CREAM);
  // ear (incised), eye, wrinkles
  s += stroke("M 118 58 Q 133 62 130 82 Q 121 90 111 83 Q 108 66 118 58", 1.5, CUT);
  s += circle(143, 66, 2, CUT);
  s += stroke("M 150 80 Q 155 82 158 86", 1, CUT);
  // tail
  s += line(46, 86, 39, 112, 3) + circle(38, 115, 2.5);
  // mahout with goad
  s += armSeg(120, 46, 123, 28, 7) + circle(124, 21, 5);
  s += armSeg(122, 32, 140, 25, 4) + line(140, 25, 152, 14, 1.6);
  return s;
}

function elLeg(x: number): string {
  return (
    fill(`M ${x} 96 L ${x + 14} 96 L ${x + 13} 132 L ${x + 15} 136 L ${x - 1} 136 L ${x + 1} 132 Z`) +
    line(x + 2, 132, x + 12, 132, 1.2, CUT)
  );
}

function chariot(): string {
  let s = "";
  // team: one full horse + a second fanned head/neck behind
  s += `<g transform="translate(44,6) scale(0.8)">
    ${fill(`M 116 54 Q 126 50 136 38 Q 141 30 148 28 L 156 36 Q 148 42 142 52 Q 136 64 130 68 L 118 64 Z`)}
    ${fill(`M 148 28 Q 153 22 159 24 L 174 38 Q 176 42 172 44 L 158 46 Q 152 44 148 38 Z`)}
    ${poly([[151, 25], [155, 14], [160, 24]])}
  </g>`;
  s += `<g transform="translate(28,16) scale(0.9)">${horse()}</g>`;
  // pole + yoke
  s += line(86, 94, 148, 82, 4);
  // wheel with incised spokes, hub, scythes
  s += circle(66, 112, 24) + ring(66, 112, 19.5, 1.3);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + 0.26;
    s += line(
      66 + Math.cos(a) * 3,
      112 + Math.sin(a) * 3,
      66 + Math.cos(a) * 18,
      112 + Math.sin(a) * 18,
      2,
      CUT,
    );
  }
  s += circle(66, 112, 3, CUT);
  s += stroke("M 66 112 Q 94 120 103 135", 3.4) + stroke("M 103 135 Q 106 130 103 126", 2.4);
  s += stroke("M 66 112 Q 40 122 31 135", 3.4) + stroke("M 31 135 Q 27 130 30 126", 2.4);
  // cab (breastwork), rail incision
  s += fill(`M 42 90 Q 40 62 58 58 L 82 58 L 87 92 Q 66 99 42 90 Z`);
  s += stroke("M 46 66 Q 62 62 80 63", 1.3, CUT);
  // driver leaning into the reins
  s += armSeg(62, 58, 68, 34, 8) + circle(72, 27, 5.5);
  s += fill(`M 66 24 Q 68 16 75 16 Q 81 17 82 24 Z`);
  s += armSeg(68, 40, 94, 46, 5) + hand(95, 46);
  s += line(95, 46, 128, 56, 1.2) + line(95, 48, 126, 62, 1.2);
  return s;
}

/* ---------- assembly ---------- */

function stage(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" preserveAspectRatio="xMidYMax meet">
    <rect x="8" y="136" width="184" height="2.6" fill="${FIG}"/>
    ${inner}
  </svg>`;
}

/**
 * When the turn theme inverts (Player 1 acting), cards flip from
 * red-ground/black-figure to black-ground/red-figure: swap the figure
 * and ground colours throughout the generated SVG.
 */
export function unitArtSVG(def: UnitDef, invert = false): string {
  const svg = buildArt(def);
  if (!invert) return svg;
  const TMP = "#SWAP#";
  return svg.split(FIG).join(TMP).split(CUT).join(FIG).split(TMP).join(CUT);
}

function buildArt(def: UnitDef): string {
  switch (def.id) {
    case "pezhetairoi":
      return stage(rondacheBack() + legsStride() + torso() + pike() + headPilos());
    case "hoplitai":
      return stage(legsStride() + torso() + spearOverhead() + headCorinthian(true) + hoplon("lambda"));
    case "hypaspistai":
      return stage(legsStride() + torso() + spearOverhead() + headCorinthian(true) + hoplon("star"));
    case "thureophoroi":
      return stage(legsStand() + torso() + uprightSpear(134) + headPilos() + thureos());
    case "peltastai":
      return stage(legsRun() + torso() + javelinThrow() + headBare() + pelta());
    case "toxotai":
      return stage(legsStand() + torso() + headCap() + bowDrawn() + quiver());
    case "sphendonetai":
      return stage(legsStride() + torso() + slingWhirl() + headBare() + pouch());
    case "hetairoi":
      return stage(horse() + rider({ helmet: "crested", cloak: true, weapon: "xyston" }));
    case "thessaloi":
      return stage(horse() + rider({ helmet: "petasos", cloak: true, weapon: "xyston" }));
    case "prodromoi":
      return stage(horse() + rider({ helmet: "pilos", weapon: "longLance" }));
    case "hippeis":
      return stage(horse() + rider({ helmet: "boeotian", weapon: "spearDown", shield: true }));
    case "tarantinoi":
      return stage(horse() + rider({ helmet: "petasos", weapon: "javelin", shield: true }));
    case "hippotoxotai":
      return stage(horse() + rider({ helmet: "cap", weapon: "bow" }));
    case "elephantes":
      return stage(elephant());
    case "drepanephoroi":
      return stage(chariot());
  }
}

/** Quiver slung at the archer's hip. */
function quiver(): string {
  return (
    poly([[64, 70], [73, 72], [68, 96], [60, 94]]) +
    line(66, 71, 63, 64, 1.4) +
    line(69, 72, 68, 64, 1.4) +
    stroke("M 72 74 Q 82 60 86 48", 1, CUT)
  );
}

/** Slinger's bullet pouch. */
function pouch(): string {
  return circle(72, 80, 6) + stroke("M 70 74 Q 78 60 84 48", 1, CUT);
}
