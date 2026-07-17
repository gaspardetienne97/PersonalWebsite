import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const pianoDir = "build/client/audio/music/piano";
const samples = (await readdir(pianoDir)).filter((file) => file.endsWith(".mp3")).sort();
const totalBytes = (
  await Promise.all(samples.map(async (file) => (await stat(join(pianoDir, file))).size))
).reduce((total, size) => total + size, 0);

if (totalBytes < 1024 * 1024 || totalBytes > 2 * 1024 * 1024) {
  throw new Error(`Piano sample subset must stay within 1–2 MiB; found ${totalBytes} bytes.`);
}

const serviceWorker = await readFile("build/client/sw.js", "utf8");
for (const sample of samples) {
  const url = `audio/music/piano/${sample}`;
  if (!serviceWorker.includes(url)) throw new Error(`Piano sample missing from precache: ${url}`);
}
if (serviceWorker.includes("audio/jazz/")) {
  throw new Error("Jazz audio must remain excluded from the service-worker precache.");
}

console.log(
  `Verified ${samples.length} precached piano samples (${totalBytes} bytes); jazz excluded.`,
);
