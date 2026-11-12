// Song loops by ear: a chord loop in a key set first, named chord by chord with
// the buttons or played back over fake MIDI; a checked run records its loop set.
import { expect, test, type Page } from "@playwright/test";
import { installFakeMidi, midiNote, PORTS, pickMode } from "./fixtures";

/** "bVII" as its button shows it. */
const numeralLabel = (t: string) => t.replace(/^b/, "♭");

test.describe.configure({ retries: 2 });

const prompt = (page: Page) => page.locator("article[data-drill]");
const slots = (page: Page) =>
  page.getByRole("list", { name: "Your progression" }).getByRole("listitem");
const tap = (page: Page, t: string) =>
  page.locator("button.choice", { hasText: new RegExp(`^${numeralLabel(t)}$`) }).click();

/** The last finished run, read back from IndexedDB. */
const lastRun = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ exerciseId: string; params: Record<string, unknown>; score: number }>(
        (resolve, reject) => {
          const open = indexedDB.open("woodshed");
          open.onsuccess = () => {
            const get = open.result.transaction("sessions").objectStore("sessions").getAll();
            get.onsuccess = () =>
              resolve(get.result.flatMap((s: { runs: unknown[] }) => s.runs).at(-1) as never);
            get.onerror = () => reject(get.error);
          };
        },
      ),
  );

test("song loops: every chord into a slot, judged chord by chord", async ({ page }) => {
  await page.goto("/music/ear/song-loops?answer=choice&loops=rock");
  await expect(page.getByRole("heading", { level: 1, name: "Song loops" })).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const card = prompt(page);
  await expect(card).toHaveAttribute("data-drill", "loop");
  const chords = (await card.getAttribute("data-answer"))!.split(" ");
  await expect(slots(page)).toHaveCount(chords.length);
  await expect(slots(page).first()).toHaveText("?");

  for (const c of chords.slice(0, -1)) await tap(page, c);
  const last = chords.at(-1)!;
  await tap(page, last === "IV" ? "bVII" : "IV");
  await expect(card).toHaveAttribute("data-step", "feedback");
  await expect(slots(page).first()).toHaveAttribute("data-state", "right");
  await expect(slots(page).last()).toHaveAttribute("data-state", "wrong");
  await expect(slots(page).last()).toContainText(`✕ ${numeralLabel(last)}`);
  await expect(card.locator("figure.staff-card figcaption").first()).toContainText(/In [A-G]/);
});

test("song loops: a checked run of modal vamps, all right, records its set", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/music/ear/song-loops?answer=choice&loops=modal");
  await pickMode(page, "Check");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let i = 0; i < 10; i++) {
    await expect(prompt(page)).toHaveAttribute("aria-label", `Question ${i + 1}`, {
      timeout: 8000,
    });
    for (const c of (await prompt(page).getAttribute("data-answer"))!.split(" "))
      await tap(page, c);
  }
  await expect(page.getByRole("status")).toContainText("All 10 right.");
  const run = await lastRun(page);
  expect(run.exerciseId).toBe("ear.song-loops");
  expect(run.params.loops).toBe("modal");
  expect(run.score).toBe(1);
});

test("song loops: played back over fake MIDI, a chord a slot", async ({ page }) => {
  test.setTimeout(60_000);
  await installFakeMidi(page, [PORTS.keys]);
  await page.goto("/music/ear/song-loops?answer=play-back&loops=pop");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("woodshed");
        open.onsuccess = () => {
          const tx = open.result.transaction("settings", "readwrite");
          const store = tx.objectStore("settings");
          const get = store.get("music.settings");
          get.onsuccess = () =>
            store.put({
              id: "music.settings",
              value: { ...get.result?.value, midiEnabledBefore: true, countInBars: 0 },
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(prompt(page)).toHaveAttribute("data-step", "answer", { timeout: 40_000 });
  const key = Number(await prompt(page).getAttribute("data-key"));
  const chords = (await prompt(page).getAttribute("data-answer"))!.split(" ");
  // Pop loops use I, IV, V and vi: each chord from middle C up, in first inversion.
  const ROOT: Record<string, [number, boolean]> = {
    I: [0, false],
    IV: [5, false],
    V: [7, false],
    vi: [9, true],
  };
  const play = async (t: string) => {
    const [r, minor] = ROOT[t];
    const root = 60 + ((key + r) % 12);
    for (const m of [root + (minor ? 3 : 4), root + 7, root + 12])
      await midiNote(page, PORTS.keys.id, m);
  };
  for (const [i, c] of chords.slice(0, -1).entries()) {
    await play(c);
    await expect(slots(page).nth(i)).toHaveText(numeralLabel(c));
  }
  await play(chords.at(-1) === "V" ? "IV" : "V");
  await expect(prompt(page)).toHaveAttribute("data-step", "feedback");
  await expect(slots(page).first()).toHaveAttribute("data-state", "right");
  await expect(slots(page).last()).toHaveAttribute("data-state", "wrong");
});
