/**
 * Captures the still each scene shows in its window on /scenes (and while the
 * live scene loads): opens every scene in headless Chromium, waits for the
 * live frame, screenshots the canvas alone and writes a 960x600 WebP to
 * public/posters/scenes/<id>.webp.
 *
 * Run against a served build after changing a scene's look:
 *   npm run build && npx vite preview --port 4173 &
 *   node --experimental-strip-types scripts/capture-scene-posters.ts http://127.0.0.1:4173
 *
 * Needs Playwright with Chromium installed; it is not a project dependency.
 */
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import sharp from "sharp";

const require = createRequire(import.meta.url);
// Loaded at run time and loosely typed: Playwright is installed where the script runs, not here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = require("playwright") as { chromium: any };

const base = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const only = process.argv.slice(3);
const out = path.resolve("public/posters/scenes");
const W = 960, H = 600;

// Every element but the two canvases is hidden; visibility can be turned back on in a child.
const CANVAS_ONLY = `
  body * { visibility: hidden !important; transition: none !important; }
  .hero__canvas, .hero__cipher.is-on { visibility: visible !important; }
`;

async function main() {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: W, height: H + 120 }, deviceScaleFactor: 1 });
  await page.goto(`${base}/scenes`);
  const ids: string[] = await page.$$eval("[data-portal]", (els: Element[]) => els.map((e) => (e as HTMLElement).dataset.portal!));
  for (const id of ids) {
    if (only.length && !only.includes(id)) continue;
    await page.goto(`${base}/scenes/${id}`);
    await page.addStyleTag({ content: CANVAS_ONLY });
    if (id === "cipher") await page.waitForTimeout(3000);
    else {
      await page.waitForSelector(".scenes__still.is-gone", { state: "attached", timeout: 60_000 });
      await page.waitForTimeout(1500);
    }
    // Field rests as a faint hint of contours; a few taps reveal the map the window should show.
    if (id === "field") {
      const b = (await page.locator(".scenes__stage").boundingBox())!;
      for (const [fx, fy] of [[0.5, 0.55], [0.3, 0.4], [0.72, 0.68]]) await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
      await page.waitForTimeout(1600);
    }
    // The stage itself is hidden, so clip a page shot to its box instead of shooting the element.
    const box = await page.locator(".scenes__stage").boundingBox();
    if (!box) throw new Error(`no stage for ${id}`);
    const shot = await page.screenshot({ type: "png", clip: box });
    const file = path.join(out, `${id}.webp`);
    await sharp(shot).resize(W, H, { fit: "cover", kernel: "nearest" }).webp({ quality: 78, effort: 6 }).toFile(file);
    console.log(`${id} -> ${path.relative(process.cwd(), file)}`);
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
