// Scores downloaded for the path shelves (scripts/fetch-scores.mjs), kept outside git and the
// client bundle: <MUSIC_SCORES_DIR>/<path>/<song>.<mxl|musicxml|xml|mid>.
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "$env/dynamic/private";

export const scoresDir = () => resolve(env.MUSIC_SCORES_DIR || ".music-scores");

const SLUG = /^[a-z0-9-]+$/;
export const SCORE_EXT = ["mxl", "musicxml", "xml", "mid"] as const;

/** Every downloaded score as its shelf key (`<path>/<song>`) and file name. */
export async function listScores(): Promise<{ key: string; file: string }[]> {
  const root = scoresDir();
  const paths = await readdir(root, { withFileTypes: true }).catch(() => []);
  const out: { key: string; file: string }[] = [];
  for (const p of paths) {
    if (!p.isDirectory() || !SLUG.test(p.name)) continue;
    for (const f of await readdir(join(root, p.name))) {
      const m = f.match(/^([a-z0-9-]+)\.([a-z]+)$/);
      if (m && (SCORE_EXT as readonly string[]).includes(m[2]))
        out.push({ key: `${p.name}/${m[1]}`, file: f });
    }
  }
  return out;
}

/** The bytes and file name of one shelf song's score, or null. Only slugs reach the disk. */
export async function readScore(path: string, song: string) {
  if (!SLUG.test(path) || !SLUG.test(song)) return null;
  const hit = (await listScores()).find((s) => s.key === `${path}/${song}`);
  if (!hit) return null;
  return { file: hit.file, bytes: await readFile(join(scoresDir(), path, hit.file)) };
}
