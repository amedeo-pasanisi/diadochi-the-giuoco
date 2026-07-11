// Probe the battle HUD layout live.
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e)));
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });

// fast-forward to battle: minimal musters
await page.click("text=March to War");
await page.click("text=I am Player 1");
await page.waitForSelector("text=Unit Roster");
await page.click(".unit-card >> nth=1");
await page.click("text=March to Battle");
await page.click("text=I am Player 2");
await page.waitForSelector("text=Unit Roster");
await page.click(".unit-card >> nth=1");
await page.click("text=March to Battle");
await page.waitForTimeout(2600);
await page.click(".contest-stage .center-stage");
await page.waitForSelector("text=Choose the battlefield");
await page.click(".battlefield-card >> nth=0");
await page.click("text=Deploy Army");
await page.click("text=I am Player 1");
await page.waitForSelector("canvas.field-canvas");
await page.click("text=Alalai!");
await page.click("text=I am Player 2");
await page.waitForSelector("canvas.field-canvas");
await page.click("text=Alalai!");
await page.waitForSelector("text=Command Phase");
await page.click('.battle-curtain button:has-text("Ready")');
await page.waitForTimeout(1200);

const probe = await page.evaluate(() => {
  const pick = (sel) => {
    const n = document.querySelector(sel);
    if (!n) return "MISSING";
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    return `pos=${cs.position} display=${cs.display} rect=${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} z=${cs.zIndex}`;
  };
  return {
    fieldWrap: pick(".battle-field"),
    portrait: pick(".hud-portrait"),
    chipCmd: pick(".chip-command"),
    chipBrill: pick(".chip-brill"),
    center: pick(".hud-center"),
    canvas: pick(".battle-canvas"),
    sheetCount: document.styleSheets.length,
  };
});
console.log(JSON.stringify(probe, null, 2));
await page.screenshot({ path: process.argv[2] ?? "hudprobe.png" });
await browser.close();
