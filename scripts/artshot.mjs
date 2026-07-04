// Screenshot the art preview page for iteration.
import { chromium } from "playwright-core";

const out = process.argv[2] ?? "art.png";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e)));
await page.goto("http://localhost:5173/preview.html", { waitUntil: "networkidle" });
await page.screenshot({ path: out, fullPage: true });
// close-ups of individual cards: pass indices as 3rd arg, e.g. "1,4,6,14"
if (process.argv[3]) {
  for (const i of process.argv[3].split(",")) {
    await page
      .locator(".c")
      .nth(Number(i))
      .screenshot({ path: out.replace(/\.png$/, `-card${i}.png`) });
  }
}
await browser.close();
console.log("saved", out);
