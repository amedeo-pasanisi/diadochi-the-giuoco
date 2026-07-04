import { el } from "../dom";
import { applyMeander } from "../art/ornaments";
import { Camera } from "../field/camera";
import { drawScene, loadMapImage } from "../field/fieldRenderer";
import type { BattlefieldDef } from "../../engine/battlefield";
import type { DeploymentState } from "../../engine/deployment";

/** End of the deployment milestone: both lines drawn, battle to come. */
export function battleStubScreen(
  def: BattlefieldDef,
  deployments: [DeploymentState, DeploymentState],
  onRestart: () => void,
): HTMLElement {
  const top = el("div", { class: "meander" });
  const bottom = el("div", { class: "meander" });
  applyMeander(top);
  applyMeander(bottom);

  const canvas = el("canvas", { class: "field-canvas stub-canvas" }) as HTMLCanvasElement;
  const back = el("button", { class: "btn-marble" }, "Back to the Title");
  back.addEventListener("click", onRestart);

  const body = el(
    "div",
    { class: "center-stage", style: "gap:14px" },
    el("div", { class: "title-major", style: "font-size:24px" }, "The lines are drawn"),
    el(
      "div",
      { class: "subtitle-line" },
      "both armies stand ready — the battle itself arrives with the next milestone",
    ),
    canvas,
    back,
  );

  let stopped = false;
  back.addEventListener("click", () => {
    stopped = true;
  });

  loadMapImage(def, () => undefined);
  const frame = (): void => {
    if (stopped || !canvas.isConnected) {
      if (!canvas.isConnected && !stopped) requestAnimationFrame(frame);
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w > 0 && (canvas.width !== w * dpr || canvas.height !== h * dpr)) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const cam = new Camera(w, h);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, {
      def,
      cam,
      units: [...deployments[0].units, ...deployments[1].units],
      generals: [deployments[0].general, deployments[1].general],
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  return el("div", { class: "screen" }, top, el("div", { class: "screen-body" }, body), bottom);
}
