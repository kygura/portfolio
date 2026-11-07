/**
 * Post-build: give /cv a body that doesn't need JavaScript.
 *
 * Runs after `vite build` and writes
 *   - `dist/cv.html`  the SPA shell with the CV pre-rendered into #root
 *   - `dist/cv.md`    the CV as markdown
 *
 * vercel.json rewrites /cv to cv.html (or cv.md for `Accept: text/markdown`).
 *
 * Usage: bun scripts/build-cv.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cv } from "../content/cv.ts";
import { injectCvIntoShell, renderCvMarkdown } from "./cv/render.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

function siteOrigin(): string {
  const configured = process.env.SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "";
  const origin = configured.trim().replace(/\/+$/, "");
  if (!origin) return "";
  return /^https?:\/\//.test(origin) ? origin : `https://${origin}`;
}

const origin = siteOrigin();
const shell = await fs.readFile(path.join(DIST, "index.html"), "utf-8");
await fs.writeFile(path.join(DIST, "cv.html"), injectCvIntoShell(shell, cv, origin), "utf-8");
await fs.writeFile(path.join(DIST, "cv.md"), renderCvMarkdown(cv, origin), "utf-8");
console.log("[cv] wrote dist/cv.html and dist/cv.md");
