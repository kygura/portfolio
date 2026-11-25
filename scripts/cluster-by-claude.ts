/**
 * Clustering without the Anthropic API: the fallback a Claude Code scheduled
 * task runs when a production build could not reach Haiku.
 *
 *   bun scripts/cluster-by-claude.ts prompt          print the exact prompt Haiku gets
 *   bun scripts/cluster-by-claude.ts apply <file>    validate an answer, write clusters.json
 *
 * The corpus is `content/writings/*.md`, read the way the build reads it. An
 * answer goes through the build's own parser: it must place every essay and
 * give each one usable topics, or nothing is written and the script exits 1.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPostFromMarkdown } from "../content/markdown.ts";
import {
  clusterPrompt,
  corpusHash,
  finish,
  parseAnswer,
  type Clustering,
  type CorpusPost,
} from "./notion/clusters.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = path.join(ROOT, "content", "writings");
const CLUSTERS_PATH = path.join(CONTENT_DIR, "clusters.json");

async function readCorpus(): Promise<CorpusPost[]> {
  const files = (await fs.readdir(CONTENT_DIR)).filter((file) => file.endsWith(".md")).sort();
  const corpus: CorpusPost[] = [];
  for (const file of files) {
    const parsed = buildPostFromMarkdown(await fs.readFile(path.join(CONTENT_DIR, file), "utf-8"), file.slice(0, -3));
    if (!parsed) throw new Error(`content/writings/${file} has no title in its frontmatter`);
    corpus.push({ slug: parsed.summary.slug, title: parsed.summary.title, body: parsed.content, tags: parsed.summary.tags });
  }
  return corpus;
}

async function readPrevious(): Promise<Partial<Clustering>> {
  try {
    return JSON.parse(await fs.readFile(CLUSTERS_PATH, "utf-8")) as Partial<Clustering>;
  } catch {
    return {};
  }
}

const [command, answerPath] = process.argv.slice(2);
const corpus = await readCorpus();

if (command === "prompt") {
  const previous = await readPrevious();
  const { system, user } = clusterPrompt(corpus, previous.clusters ?? null, previous.topics ?? null);
  console.log(`${system}\n\n${user}`);
} else if (command === "apply" && answerPath) {
  const answer = parseAnswer(await fs.readFile(answerPath, "utf-8"), corpus);
  if (!answer) {
    console.error("The answer is not usable: it must be JSON that places every essay once and gives each essay at least one topic.");
    process.exit(1);
  }
  const clustering: Clustering = { hash: corpusHash(corpus), source: "model", clusters: finish(answer.clusters), topics: answer.topics };
  await fs.writeFile(CLUSTERS_PATH, `${JSON.stringify(clustering, null, 2)}\n`, "utf-8");
  const shape = clustering.clusters.map((cluster) => `${cluster.numeral} ${cluster.name} (${cluster.slugs.length})`).join(", ");
  console.log(`clusters.json written for ${corpus.length} essays: ${shape}`);
} else {
  console.error("Usage: bun scripts/cluster-by-claude.ts prompt | apply <answer.json>");
  process.exit(2);
}
