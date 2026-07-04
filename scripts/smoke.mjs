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

// Cycle general to Antigonos and appoint him
await page.click(".coin-arrow >> nth=1"); // next arrow
await page.click(".coin-wrap");

// Hover a card to show the tooltip
await page.hover(".unit-card >> nth=14");
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/4-select-filled.png` });

// March, P2 handoff appears
await page.click("text=March to Battle");
await page.waitForSelector("text=Player 2");
await page.screenshot({ path: `${outDir}/5-handoff-p2.png` });

console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
await browser.close();
