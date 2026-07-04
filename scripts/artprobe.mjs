import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e)));
page.on("console", (m) => console.log("CONSOLE:", m.type(), m.text()));
await page.goto("http://localhost:5173/preview.html", { waitUntil: "networkidle" });
const html = await page.content();
console.log("cards:", (html.match(/class="c"/g) ?? []).length);
console.log("has new pelta:", html.includes("M 92 48 A 24 24"));
console.log("has chiton:", html.includes("M 73 72 L 97 72"));
const pelt = await page.evaluate(
  () => document.querySelectorAll(".c")[4].querySelector("svg").outerHTML.slice(0, 900),
);
console.log("PELTAST SVG HEAD:\n", pelt);
await browser.close();
