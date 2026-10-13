// Dev helper: node scripts/screenshot.mjs <path> <out.png> [width] [theme]
import { chromium } from "@playwright/test";
const [, , path = "/", out = "shot.png", width = "1440", theme] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 }, colorScheme: theme === "light" ? "light" : "dark" });
await page.goto(`http://127.0.0.1:3000${path}`, { waitUntil: "networkidle" });
await page.waitForTimeout(Number(process.env.WAIT ?? 2200));
await page.screenshot({ path: out, fullPage: true });
await browser.close();
