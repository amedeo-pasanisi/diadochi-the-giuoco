// Smoke-drive the app in headless Edge and capture screenshots.
import { chromium } from "playwright-core";

const outDir = process.argv[2] ?? "shots";
const errors = [];

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(String(err)));

await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForSelector("text=Wars of the Diadochi");
await page.screenshot({ path: `${outDir}/1-title.png` });

await page.click("text=March to War");
await page.waitForSelector("text=Player 1");
await page.screenshot({ path: `${outDir}/2-handoff.png` });

await page.click("text=I am Player 1");
await page.waitForSelector("text=Unit Roster");
await page.screenshot({ path: `${outDir}/3-select-empty.png` });

// Recruit: 6x Pezhetairoi (to see inflation), 2x Hetairoi, 1 elephant
const cards = page.locator(".unit-card");
for (let i = 0; i < 6; i++) await cards.nth(0).click();
for (let i = 0; i < 2; i++) await cards.nth(7).click();
await cards.nth(13).click();

// Cycle general to Antigonos — the shown general is auto-appointed
await page.click(".coin-arrow >> nth=1"); // next arrow

// Hover a card to show the tooltip
await page.hover(".unit-card >> nth=14");
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/4-select-filled.png` });

// March, P2 handoff appears
await page.click("text=March to Battle");
await page.waitForSelector("text=Player 2");
await page.screenshot({ path: `${outDir}/5-handoff-p2.png` });

// Player 2 quick muster: 3 Hoplitai, 2 Prodromoi, keep Seleukos
await page.click("text=I am Player 2");
await page.waitForSelector("text=Unit Roster");
for (let i = 0; i < 3; i++) await cards.nth(1).click();
for (let i = 0; i < 2; i++) await cards.nth(9).click();
await page.click("text=March to Battle");

// Contest screen: dice tumble, then totals/verdict reveal
await page.waitForSelector("text=The Choice of Ground");
await page.waitForTimeout(700);
await page.screenshot({ path: `${outDir}/6a-dice-rolling.png` });
await page.waitForTimeout(1900);
await page.screenshot({ path: `${outDir}/6-contest.png` });

// Click anywhere to skip the countdown — same screen crossfades to the maps
await page.click(".contest-stage .center-stage");
await page.waitForSelector("text=Choose the battlefield");
await page.waitForTimeout(650);
await page.click(".battlefield-card >> nth=1");
await page.screenshot({ path: `${outDir}/7-battlefields.png` });
await page.click("text=Deploy Army");

// P1 deployment
await page.waitForSelector("text=Player 1");
await page.click("text=I am Player 1");
await page.waitForSelector("canvas.field-canvas");
await page.waitForTimeout(600); // map bitmap rasterizes

// compute screen coords of a world point via the fitted camera
const worldToScreen = async (wx, wy) =>
  await page.evaluate(
    ([wx, wy]) => {
      const c = document.querySelector("canvas.field-canvas");
      const r = c.getBoundingClientRect();
      const scale = (Math.min(r.width, r.height) / 6000) * 0.96;
      return [r.left + r.width / 2 + (wx - 3000) * scale, r.top + r.height / 2 + (wy - 3000) * scale];
    },
    [wx, wy],
  );

// P1's first rank sits at y=5300 around x=2160.. — select one unit
let [sx, sy] = await worldToScreen(2160, 5300);
await page.mouse.click(sx, sy);
await page.waitForTimeout(150);
// move it aside with a plain right-click (keeps facing)
let [tx, ty] = await worldToScreen(4500, 4600);
await page.mouse.click(tx, ty, { button: "right" });
await page.waitForTimeout(150);

// box-select the remaining front rank (left-drag)
let [bx0, by0] = await worldToScreen(2000, 5230);
let [bx1, by1] = await worldToScreen(4000, 5370);
await page.mouse.move(bx0, by0);
await page.mouse.down();
await page.mouse.move(bx1, by1, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(150);

// perno line: right-drag from the pivot eastward — stretched formation
let [px, py] = await worldToScreen(1400, 4700);
let [qx, qy] = await worldToScreen(3900, 4700);
await page.mouse.move(px, py);
await page.mouse.down({ button: "right" });
await page.mouse.move(qx, qy, { steps: 10 });
await page.waitForTimeout(150);
await page.screenshot({ path: `${outDir}/8-deploy-p1-ghosts.png` });
await page.mouse.up({ button: "right" });
await page.waitForTimeout(200);
await page.screenshot({ path: `${outDir}/8-deploy-p1.png` });

// attach the general (now standing with the ranks) to the elephant
let [gx, gy] = await worldToScreen(1840, 5300);
await page.mouse.click(gx, gy);
await page.waitForTimeout(120);
let [ex, ey] = await worldToScreen(3000, 5140);
await page.mouse.click(ex, ey, { button: "right" });
await page.waitForSelector("text=Attach Antigonos");
await page.screenshot({ path: `${outDir}/8b-attach-popup.png` });
await page.click('.field-popup button:has-text("Attach")');
await page.waitForTimeout(150);
await page.screenshot({ path: `${outDir}/8b-attach.png` });

await page.click("text=Alalai!");
await page.waitForSelector("text=Player 2");
await page.click("text=I am Player 2");
await page.waitForSelector("canvas.field-canvas");
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/9-deploy-p2.png` });
await page.click("text=Alalai!");

// ---- battle: turn 1 ----
const sendPhase = async (label) => {
  await page.click(`text=${label}`);
  await page.click('.field-popup button:has-text("Send"), .field-popup button:has-text("Shout")');
};

await page.waitForSelector("text=Command Phase");
await page.click('.battle-curtain button:has-text("Ready")');
await page.waitForTimeout(300);

// select one P1 unit (moved earlier to 4500,4600) and march it north
let [ux, uy] = await worldToScreen(4500, 4600);
await page.mouse.click(ux, uy);
await page.waitForTimeout(150);
// perno drag: right-press at a pivot, drag, release
let [mx, my] = await worldToScreen(4100, 3200);
let [nx, ny] = await worldToScreen(4600, 3200);
await page.mouse.move(mx, my);
await page.mouse.down({ button: "right" });
await page.mouse.move(nx, ny, { steps: 8 });
await page.waitForTimeout(120);
await page.screenshot({ path: `${outDir}/11-battle-orders.png` });
await page.mouse.up({ button: "right" });
await page.waitForTimeout(150);

await sendPhase("Send Messengers");
await page.click('.battle-curtain button:has-text("Ready")'); // P2 command
await sendPhase("Send Messengers");
await page.click('.battle-curtain button:has-text("Ready")'); // P1 glance
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/11b-glance.png` });
await sendPhase("Shout Orders");
await page.click('.battle-curtain button:has-text("Ready")'); // P2 glance
await sendPhase("Shout Orders");

// battle phase playback
await page.waitForSelector("text=The Battle Phase");
await page.click('.battle-curtain button:has-text("Ready")');
await page.waitForTimeout(2200);
await page.screenshot({ path: `${outDir}/12-battle-playback.png` });
await page.waitForSelector("text=the field speaks", { timeout: 15000 });
await page.screenshot({ path: `${outDir}/13-battle-events.png` });
await page.click('.field-popup button:has-text("Continue")');

// turn 2: P1 sounds the retreat
await page.waitForSelector("text=Command Phase");
await page.click('.battle-curtain button:has-text("Ready")');
await page.click("text=Sound Retreat");
await page.click('.field-popup button:has-text("Sound it")');
await page.waitForSelector("text=Victory — Player 2");
await page.screenshot({ path: `${outDir}/14-result.png` });

console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
await browser.close();
