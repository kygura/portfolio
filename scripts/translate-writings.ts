/**
 * Batch-translate every post into one language and commit the result to
 * content/translations/<lang>/<slug>.md. The /api/writings/translate endpoint
 * serves these files first, so readers of a committed language never wait on
 * the model.
 *
 * A file is skipped while its sourceHash matches the post. Edit a post in
 * Notion and the next run re-translates only that one.
 *
 * Usage:
 *   bun scripts/translate-writings.ts --lang es            missing or stale posts
 *   bun scripts/translate-writings.ts --lang es --force    every post
 *   bun scripts/translate-writings.ts --lang es --restamp  keep the text, mark it current
 *                                                          (after a hand edit or review)
 * Needs ANTHROPIC_API_KEY, except with --restamp.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import {
  MAX_OUTPUT_TOKENS,
  MODEL,
  readFrontmatter,
  resolveLanguage,
  serializeCommitted,
  splitTranslation,
  systemPrompt,
  toSourcePost,
  userPrompt,
} from "../api/writings/translate.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITINGS = path.join(ROOT, "content", "writings");

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const force = process.argv.includes("--force");
const restamp = process.argv.includes("--restamp");

const language = resolveLanguage(arg("--lang"));
if (!language) {
  console.error("Pass --lang <code or language name>, e.g. --lang es");
  process.exit(1);
}

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
if (!restamp && !apiKey) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}
const client = apiKey ? new Anthropic({ apiKey }) : null;

const outDir = path.join(ROOT, "content", "translations", language.key);
await fs.mkdir(outDir, { recursive: true });

let failed = 0;
for (const file of (await fs.readdir(WRITINGS)).filter((f) => f.endsWith(".md")).sort()) {
  const slug = file.slice(0, -3);
  const source = toSourcePost(await fs.readFile(path.join(WRITINGS, file), "utf-8"), slug);
  if (!source) continue;
  const target = path.join(outDir, file);
  const existing = await fs.readFile(target, "utf-8").catch(() => null);
  const current = existing ? readFrontmatter(existing) : null;

  if (restamp) {
    if (current?.data.title && current.body) {
      await fs.writeFile(target, serializeCommitted(source, language, current.data.title, current.body));
      console.log(`[translate] restamped ${slug}`);
    }
    continue;
  }
  if (!force && current?.data.sourceHash === source.hash) {
    console.log(`[translate] ${slug}: up to date`);
    continue;
  }

  process.stdout.write(`[translate] ${slug} → ${language.name}… `);
  const message = await client!.messages
    .stream({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: systemPrompt(language.name),
      messages: [{ role: "user", content: userPrompt(source) }],
    })
    .finalMessage();
  const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  const parts = message.stop_reason === "end_turn" ? splitTranslation(text) : null;
  if (!parts) {
    console.log(`failed (stop: ${message.stop_reason})`);
    failed++;
    continue;
  }
  await fs.writeFile(target, serializeCommitted(source, language, parts.title, parts.body));
  console.log("done");
}

if (failed) process.exit(1);
