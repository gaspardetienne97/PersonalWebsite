// Learn by ear: import a recording, loop and mark it, find home (judged against
// its key) and play a part along with it (self-rated); both record a run.
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { tap } from "./fixtures";

test.describe.configure({ retries: 2 });

/** Nine seconds of i-iv-V-i in A minor as a mono 16-bit WAV. */
function aMinorWav(path: string) {
  const rate = 22050;
  const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
  const chords = [
    [45, 57, 60, 64],
    [50, 62, 65, 69],
    [52, 56, 59, 64],
    [45, 57, 60, 64],
  ];
  const per = Math.round(rate * 0.75);
  const n = per * 12;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const ch = chords[Math.floor(i / per) % 4];
    const k = i % per;
    const env = Math.min(1, k / 200) * Math.exp((-k / rate) * 1.5);
    const v =
      (ch.reduce((s, m) => s + Math.sin((2 * Math.PI * hz(m) * k) / rate), 0) / ch.length) *
      0.5 *
      env;
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

const lastRun = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{
        exerciseId: string;
        assistance: string;
        params: Record<string, unknown>;
        score: number;
      }>((resolve) => {
        const open = indexedDB.open("woodshed");
        open.onsuccess = () => {
          const get = open.result.transaction("sessions").objectStore("sessions").getAll();
          get.onsuccess = () =>
            resolve(get.result.flatMap((s: { runs: unknown[] }) => s.runs).at(-1) as never);
        };
      }),
  );

async function importWav(page: Page, path: string, url: string) {
  aMinorWav(path);
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1, name: "Learn by ear" })).toBeVisible();
  await page.getByLabel("Import a recording file").setInputFiles(path);
  await expect(page.getByRole("slider", { name: "Position in the recording" })).toBeVisible();
}

test("find home: loop and mark a recording, name its tonic, and the run is judged", async ({
  page,
}, info) => {
  await importWav(page, info.outputPath("a-minor.wav"), "/music/by-ear?mode=home");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Set A" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Set B" }).click();
  await expect(page.getByText("Loop", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Verse", exact: true }).click();
  await expect(page.getByRole("list", { name: "Marked sections" })).toContainText("Verse");
  await page.getByRole("button", { name: "Pause" }).click();

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page
    .getByRole("group", { name: "Home note" })
    .getByRole("button", { name: "A", exact: true })
    .click();
  await expect(page.getByLabel("This run")).toContainText("Right: home is A.");
  const run = await lastRun(page);
  expect(run).toMatchObject({ exerciseId: "ear.find-home", assistance: "independent", score: 1 });
  expect(run.params.mode).toBe("home");
});

test("learn a part: play along slowed down, notes shown, the run self-rated", async ({
  page,
}, info) => {
  await importWav(page, info.outputPath("a-minor.wav"), "/music/by-ear?mode=learn&speed=0.75");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  for (const m of [57, 60, 64]) await tap(page, `[data-midi="${m}"]`);
  await expect(page.getByText("You played:").locator("..")).toContainText("A3 C4 E4");
  await expect(page.locator("svg.wave circle.note")).toHaveCount(3);
  await page.getByRole("button", { name: /^Stop/ }).click();
  await page.getByRole("button", { name: "I got it" }).click();
  await expect(page.getByLabel("This run")).toContainText("Saved as got it");
  const run = await lastRun(page);
  expect(run).toMatchObject({ exerciseId: "ear.by-ear", assistance: "self-assessed", score: 1 });
  expect(run.params).toMatchObject({ mode: "learn", notes: 3, speed: 0.75 });
});
