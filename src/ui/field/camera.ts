import { MAP_SIZE_M } from "../../engine/battlefield";

/**
 * Field camera: world metres → canvas pixels, with zoom (mouse wheel),
 * rotation (§3.2 "the map can be rotated") and panning. The base
 * orientation puts Player 1's camp at the bottom (south).
 */
export class Camera {
  cx = MAP_SIZE_M / 2;
  cy = MAP_SIZE_M / 2;
  scale = 0.16; // px per metre; reset() fits the map
  rot = 0; // radians, counter-clockwise map rotation on screen

  constructor(
    public viewW: number,
    public viewH: number,
  ) {
    this.reset();
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  reset(): void {
    this.cx = MAP_SIZE_M / 2;
    this.cy = MAP_SIZE_M / 2;
    this.rot = 0;
    this.scale = (Math.min(this.viewW, this.viewH) / MAP_SIZE_M) * 0.96;
  }

  get minScale(): number {
    return (Math.min(this.viewW, this.viewH) / MAP_SIZE_M) * 0.5;
  }

  toScreen(wx: number, wy: number): [number, number] {
    const dx = wx - this.cx;
    const dy = wy - this.cy;
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    return [
      this.viewW / 2 + (dx * c - dy * s) * this.scale,
      this.viewH / 2 + (dx * s + dy * c) * this.scale,
    ];
  }

  toWorld(sx: number, sy: number): [number, number] {
    const px = (sx - this.viewW / 2) / this.scale;
    const py = (sy - this.viewH / 2) / this.scale;
    const c = Math.cos(-this.rot);
    const s = Math.sin(-this.rot);
    return [this.cx + px * c - py * s, this.cy + px * s + py * c];
  }

  /** Zoom keeping the world point under the cursor fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    this.scale = Math.max(this.minScale, Math.min(2.2, this.scale * factor));
    const [nx, ny] = this.toWorld(sx, sy);
    this.cx += wx - nx;
    this.cy += wy - ny;
    this.clamp();
  }

  panScreen(dx: number, dy: number): void {
    const c = Math.cos(-this.rot);
    const s = Math.sin(-this.rot);
    this.cx -= (dx * c - dy * s) / this.scale;
    this.cy -= (dx * s + dy * c) / this.scale;
    this.clamp();
  }

  rotate(delta: number): void {
    this.rot += delta;
  }

  private clamp(): void {
    const m = 800;
    this.cx = Math.max(-m, Math.min(MAP_SIZE_M + m, this.cx));
    this.cy = Math.max(-m, Math.min(MAP_SIZE_M + m, this.cy));
  }
}
