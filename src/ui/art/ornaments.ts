/** Decorative ornaments: Greek key strips, laurel flourishes. */

const MEANDER_CELL = `
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <path d="M1 21 V1 H21 V15 H9 V9 H15" fill="none" stroke="#c06a34" stroke-width="2.6"/>
</svg>`;

/** CSS background-image value for a repeating Greek key strip. */
export function meanderBackground(): string {
  const encoded = encodeURIComponent(MEANDER_CELL.replace(/\s+/g, " ").trim());
  return `url("data:image/svg+xml,${encoded}")`;
}

export function applyMeander(elmt: HTMLElement): void {
  elmt.style.backgroundImage = meanderBackground();
}

/** A pair of laurel branches meeting under a point, for the title screen. */
export function laurelSVG(width = 300, color = "#c06a34"): string {
  const leaves: string[] = [];
  // one branch curving up-right; mirrored for the left side.
  // Leaves sit in alternating pairs along the stem, clearly separated.
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    // point on the stem quadratic M18,64 Q80,34 132,24
    const x = (1 - t) * (1 - t) * 18 + 2 * (1 - t) * t * 80 + t * t * 132;
    const y = (1 - t) * (1 - t) * 64 + 2 * (1 - t) * t * 34 + t * t * 24;
    const stemAngle = -28 + t * 12;
    const size = 13 - t * 3.5;
    for (const side of [-52, 42]) {
      const a = stemAngle + side;
      const rad = (a * Math.PI) / 180;
      const lx = x + Math.cos(rad) * (size + 3);
      const ly = y + Math.sin(rad) * (size + 3);
      leaves.push(
        `<ellipse cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" rx="${size.toFixed(1)}" ry="3.8"
           transform="rotate(${a.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})"
           fill="${color}" opacity="${(0.7 + t * 0.3).toFixed(2)}"/>`,
      );
    }
  }
  const branch = `
    <path d="M18 64 Q 80 34 132 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
    ${leaves.join("")}`;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${(width * 80) / 300}" viewBox="0 0 300 80">
  <g>${branch}</g>
  <g transform="translate(300,0) scale(-1,1)">${branch}</g>
</svg>`;
}

/** Sixteen-pointed Argead star (camps, generals on the map — §2.2, §3.4). */
export function argeadStarSVG(size: number, color = "#c06a34"): string {
  const c = size / 2;
  const points: string[] = [];
  const outer = size * 0.48;
  const mid = size * 0.2;
  for (let i = 0; i < 32; i++) {
    const r = i % 2 === 0 ? outer : mid;
    // alternate long/short rays: even rays full length, odd rays shorter
    const rayScale = i % 4 === 0 ? 1 : i % 2 === 0 ? 0.72 : 1;
    const a = (i * Math.PI) / 16 - Math.PI / 2;
    points.push(
      `${(c + Math.cos(a) * r * rayScale).toFixed(2)},${(c + Math.sin(a) * r * rayScale).toFixed(2)}`,
    );
  }
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <polygon points="${points.join(" ")}" fill="${color}"/>
  <circle cx="${c}" cy="${c}" r="${size * 0.07}" fill="${color}"/>
</svg>`;
}
