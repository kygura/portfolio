/**
 * Stocks the tape deck: downloads Holizna's CC0 lofi collections from
 * OpenGameArt, re-encodes a handful of tracks small enough to ship in the
 * repo, and writes public/lofi/playlist.json for src/components/player.
 *
 *   bun scripts/fetch-lofi.ts            # 4 tracks from each collection
 *   bun scripts/fetch-lofi.ts --per 6    # 6 from each
 *
 * Or import our own music from a folder instead of downloading anything:
 *
 *   bun scripts/fetch-lofi.ts --from ~/tapes --artist "nca" --license "All rights reserved"
 *
 * Either way tracks are merged into the existing playlist (same file name
 * replaces the old entry), so imports and downloads can be mixed.
 *
 * Needs `unzip` and `ffmpeg` on PATH. Holizna dedicates this music to the
 * public domain (CC0 1.0), so it can be served and redistributed with no
 * attribution owed; the playlist credits them anyway. Only add other music
 * here if its licence allows redistribution (CC0 or CC-BY, credited); the
 * Pixabay licence, for one, forbids distributing tracks on their own.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

const COLLECTIONS = [
  {
    page: "https://opengameart.org/content/chill-beats-collection",
    zip: "https://opengameart.org/sites/default/files/chill_beats.zip",
  },
  {
    page: "https://opengameart.org/content/happy-lo-fi-lofi-collection",
    zip: "https://opengameart.org/sites/default/files/happy_lo-fi_lofi_collection.zip",
  },
];

const OUT = "public/lofi";
const AUDIO = /\.(mp3|wav|ogg|flac|m4a)$/i;
function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const PER = Number(arg("per") ?? 4);
const FROM = arg("from");

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : AUDIO.test(name) ? [p] : [];
  });
}

/** "03_holizna - Lighter Than Air.wav" → "Lighter Than Air" */
function titleOf(file: string) {
  return basename(file, extname(file))
    .replace(/^[\d\s._-]+/, "")
    .replace(/^holizna\s*[-–_]\s*/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const tmp = mkdtempSync(join(tmpdir(), "lofi-"));
mkdirSync(OUT, { recursive: true });
type Track = { src: string; title: string; artist: string; license: string; source?: string };
const tracks: Track[] = [];

// Lofi survives 112k joint stereo fine; ~0.8 MB a minute.
function encode(file: string, meta: Omit<Track, "src" | "title">) {
  const title = titleOf(file);
  const name = `${slug(title)}.mp3`;
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-vn", "-ac", "2", "-b:a", "112k", "-map_metadata", "-1", join(OUT, name)]);
  tracks.push({ src: `/lofi/${name}`, title, ...meta });
  console.log(`  + ${title}`);
}

try {
  if (FROM) {
    const files = walk(FROM).sort();
    if (!files.length) throw new Error(`no audio files in ${FROM}`);
    console.log(`importing ${files.length} tracks from ${FROM}`);
    const source = arg("source");
    for (const file of files) {
      encode(file, { artist: arg("artist") ?? "nca", license: arg("license") ?? "All rights reserved", ...(source && { source }) });
    }
  }
  for (const c of FROM ? [] : COLLECTIONS) {
    const zip = join(tmp, basename(c.zip));
    console.log(`fetching ${c.zip}`);
    const res = await fetch(c.zip);
    if (!res.ok) throw new Error(`${c.zip}: HTTP ${res.status}`);
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
    const dir = join(tmp, slug(basename(c.zip, ".zip")));
    run("unzip", ["-q", "-o", zip, "-d", dir]);

    for (const file of walk(dir).sort().slice(0, PER)) {
      encode(file, { artist: "Holizna", license: "CC0-1.0", source: c.page });
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const listPath = join(OUT, "playlist.json");
const old: { name: string; tracks: Track[] } = existsSync(listPath)
  ? JSON.parse(readFileSync(listPath, "utf8"))
  : { name: "Moss tapes", tracks: [] };
const fresh = new Set(tracks.map((t) => t.src));
const merged = [...old.tracks.filter((t) => !fresh.has(t.src)), ...tracks];
writeFileSync(listPath, JSON.stringify({ name: old.name, tracks: merged }, null, 2) + "\n");
console.log(`added ${tracks.length}; ${merged.length} tracks in ${listPath}`);
