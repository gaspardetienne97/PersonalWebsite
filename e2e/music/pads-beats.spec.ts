// Beat making on the pads and the path's last pad steps, over fake MIDI
// stamped exactly: chops, Note Repeat with aftertouch, a song-form piece,
// Stick Control, the clave and generated reading lines, faded feedback in
// Grooves, the feel ear drill and a loop built live in Create.
import { expect, test, type Page } from "@playwright/test";
import { installFakeMidi, PORTS } from "./fixtures";

const PORT = PORTS.keys.id;

async function enableMidi(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
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
        open.onerror = () => reject(open.error);
      }),
  );
  await page.reload();
}

/** Schedule notes in the page: [pad, ms from the downbeat, velocity, hold ms]. */
async function send(page: Page, downbeat: number, notes: [number, number, number, number?][]) {
  await page.evaluate(
    ({ downbeat, notes, port }) => {
      for (const [pad, at, vel, hold] of notes) {
        const when = downbeat + at;
        setTimeout(
          () => (window as any).__midi.send(port, [0x90, pad, vel], when),
          when - 60 - performance.now(),
        );
        setTimeout(
          () => (window as any).__midi.send(port, [0x80, pad, 0], when + (hold ?? 30)),
          when + (hold ?? 30) - 30 - performance.now(),
        );
      }
    },
    { downbeat, notes, port: PORT },
  );
}

/** Start, then play every target of the stage at its time. */
async function playTargets(
  page: Page,
  testId: string,
  velocity = (kind: string) => (kind === "a" ? 110 : kind === "g" ? 30 : 75),
) {
  const stage = page.getByTestId(testId);
  await page.getByRole("button", { name: /^(Start|Again)/ }).click();
  await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
  const targets = JSON.parse((await stage.getAttribute("data-targets"))!) as [
    number,
    number,
    string?,
  ][];
  const downbeat = Number(await stage.getAttribute("data-downbeat"));
  await send(
    page,
    downbeat,
    targets.map(([pad, at, kind]) => [pad, at, velocity(kind ?? "n")]),
  );
  return { targets, downbeat };
}

test.describe("beat making on the pads", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
    await installFakeMidi(page, [PORTS.keys]);
  });

  test("chop: the slices in order, then a free chop played again", async ({ page }) => {
    test.setTimeout(90_000);
    await enableMidi(page, "/music/pads?mode=chop&exercise=order&source=boom-bap-b&bpm=84");
    const stage = page.getByTestId("chop-stage");
    await expect(stage).toHaveAttribute("data-loaded", "true", { timeout: 20_000 });
    await playTargets(page, "chop-stage");
    await expect(page.getByRole("status")).toContainText("Every slice in its place", {
      timeout: 15_000,
    });

    await page.goto("/music/pads?mode=chop&exercise=free&source=keys&bpm=90");
    await expect(stage).toHaveAttribute("data-loaded", "true", { timeout: 20_000 });
    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
    const downbeat = Number(await stage.getAttribute("data-downbeat"));
    const beat = 60000 / 90;
    const take = [0, 1, 1.5, 3, 4, 6, 6.5, 8, 11, 12.5, 14].map(
      (b, i) => [37 + (i % 6), b * beat, 90] as [number, number, number],
    );
    await send(page, downbeat, [
      ...take,
      ...take.map(([p, at, v]) => [p, at + 16 * beat, v] as [number, number, number]),
    ]);
    await expect(page.getByRole("status")).toContainText("played again 100% the same", {
      timeout: 25_000,
    });
  });

  test("note repeat: a held snare builds on aftertouch to the drop", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/pads?mode=repeat&rep=build&bpm=100");
    const stage = page.getByTestId("pad-skills");
    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
    const targets = JSON.parse((await stage.getAttribute("data-targets"))!) as [
      number,
      number,
      string,
    ][];
    const downbeat = Number(await stage.getAttribute("data-downbeat"));
    const beat = 600;
    // Taps: the kicks and the drop's crash. The snare is held from the first beat to the last sixteenth.
    await send(
      page,
      downbeat,
      targets.filter(([pad]) => pad !== 38).map(([pad, at]) => [pad, at, 100]),
    );
    await page.evaluate(
      ({ downbeat, beat, port }) => {
        const at = (ms: number, bytes: number[]) =>
          setTimeout(
            () => (window as any).__midi.send(port, bytes, downbeat + ms),
            downbeat + ms - 40 - performance.now(),
          );
        at(0, [0x90, 38, 40]);
        for (let k = 0; k < 16; k++)
          at(k * beat - 20, [0xd0, Math.round((0.25 + (k / 15) * 0.7) * 127)]);
        at(15.75 * beat + 40, [0x80, 38, 0]);
      },
      { downbeat, beat, port: PORT },
    );
    await expect(page.getByRole("status")).toContainText("The build rose all the way", {
      timeout: 20_000,
    });
    await expect(page.locator("article").first()).toContainText("Aftertouch");
  });

  test("song form: every section in one take, each at its level", async ({ page }) => {
    test.setTimeout(90_000);
    await enableMidi(page, "/music/pads?mode=song&form=house-drop&bpm=200");
    const barMs = 4 * 300;
    // intro 4 soft, groove 8 medium, build 4 rising, drop 12 loud, outro 4 soft
    const level = (at: number) => {
      const bar = Math.floor((at + 50) / barMs);
      if (bar < 4 || bar >= 28) return 40;
      if (bar < 12) return 75;
      if (bar < 16) return Math.round(30 + ((at - 12 * barMs) / (4 * barMs)) * 95);
      return 115;
    };
    const stage = page.getByTestId("pad-skills");
    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
    const targets = JSON.parse((await stage.getAttribute("data-targets"))!) as [number, number][];
    const downbeat = Number(await stage.getAttribute("data-downbeat"));
    await send(
      page,
      downbeat,
      targets.map(([pad, at]) => [pad, at, level(at)]),
    );
    await expect(page.getByRole("status")).toContainText(
      "Every section passed in one take, each at its level",
      { timeout: 60_000 },
    );
  });

  test("a piece you write: grooves, a chop on the slices, a solo and a stop, graded per section", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await enableMidi(page, "/music/pads?mode=song&bpm=160");
    // A new piece comes in the set's shape, saved with the settings.
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    await page.getByRole("button", { name: "Write a new piece" }).click();
    await expect(page.getByTestId("set-check")).toContainText("In the set's shape");
    await expect(page.getByTestId("song-builder").getByRole("listitem")).toHaveCount(7);

    // A short piece written straight into the settings, to play in one take.
    const song = {
      id: "e2e",
      label: "Short set",
      bpm: 160,
      sections: [
        { role: "intro", ref: "eighth-hats", bars: 1, dyn: "soft" },
        { role: "groove", ref: "basic-rock", bars: 2, dyn: "medium" },
        { role: "groove", ref: "boom-bap-b", bars: 2, dyn: "medium" },
        { role: "groove", ref: "funky-drummer", bars: 2, dyn: "loud" },
        { role: "chop", ref: "boom-bap-b", edit: "flip", bars: 2, dyn: "medium" },
        { role: "solo", ref: "boom-bap-b", bars: 2, dyn: "medium" },
        { role: "end", ref: "stop", bars: 1, dyn: "loud" },
      ],
    };
    await page.evaluate(
      (song) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("woodshed");
          open.onsuccess = () => {
            const tx = open.result.transaction("settings", "readwrite");
            tx.objectStore("settings").put({ id: "pads.written-songs", value: [song] });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
        }),
      song,
    );
    await page.goto("/music/pads?mode=song&form=own-e2e&bpm=160");
    await expect(page.getByText("Short set.")).toBeVisible({ timeout: 10_000 });
    const barMs = 1500;
    // soft, medium, medium, medium, medium, loud, loud, medium (chop), medium (solo), loud (end)
    const level = (at: number) => {
      const bar = Math.floor((at + 50) / barMs);
      return bar < 1 ? 40 : (bar >= 5 && bar < 7) || bar >= 11 ? 115 : 75;
    };
    const stage = page.getByTestId("pad-skills");
    await page.getByRole("button", { name: /^Start/ }).click({ timeout: 20_000 });
    await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
    const targets = JSON.parse((await stage.getAttribute("data-targets"))!) as [number, number][];
    const downbeat = Number(await stage.getAttribute("data-downbeat"));
    // Slices sit on A01 to A16 in bars 8 and 9, nothing is written for the solo.
    expect(targets.some(([pad, at]) => at >= 7 * barMs && at < 9 * barMs && pad === 37)).toBe(true);
    expect(targets.some(([, at]) => at >= 9 * barMs && at < 11 * barMs)).toBe(false);
    const solo = Array.from(
      { length: 16 },
      (_, k) => [k % 2 ? 42 : 38, 9 * barMs + k * 187.5, 75] as [number, number, number],
    );
    await send(page, downbeat, [
      ...targets.map(([pad, at]) => [pad, at, level(at)] as [number, number, number]),
      ...solo,
    ]);
    await expect(page.getByRole("status")).toContainText(
      "Every section passed in one take, each at its level",
      { timeout: 40_000 },
    );
    const results = page.locator("article").first();
    await expect(results).toContainText("Chop");
    await expect(results).toContainText("Solo");
    await expect(results).toContainText("The set");
  });

  test("Stick Control, the clave and new reading lines", async ({ page }) => {
    test.setTimeout(90_000);
    await enableMidi(page, "/music/pads?mode=rudiment&pattern=stick-rrll&bpm=120");
    await expect(page.getByText("Setup:").locator("..")).toContainText("20 repetitions");
    const stage = page.getByTestId("pads-stage");
    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
    const downbeat = Number(await stage.getAttribute("data-downbeat"));
    await send(
      page,
      downbeat,
      Array.from(
        { length: 80 },
        (_, i) => [i % 4 < 2 ? 38 : 36, i * 250, 80] as [number, number, number],
      ),
    );
    await expect(page.getByRole("status")).toContainText("Clean", { timeout: 30_000 });

    await page.goto("/music/pads?mode=ostinato&line=clave&bpm=100");
    await playTargets(page, "pad-skills");
    await expect(page.getByRole("status")).toContainText("The clave held", { timeout: 20_000 });

    await page.goto("/music/pads?mode=ostinato&line=read&interp=kick&bpm=100");
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "the kick reads four new bars",
    );
    await playTargets(page, "pad-skills");
    await expect(page.getByRole("status")).toContainText("The hats held", { timeout: 20_000 });
  });

  test("faded feedback: the guide for two plays, then on your own", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/pads?mode=groove&groove=basic-rock&bpm=100&fade=true");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "the guide fades after 2 plays",
    );
    const { targets } = await playTargets(page, "pads-stage");
    expect(targets.length).toBeGreaterThan(30);
    // The highway shows for the first two plays only.
    await expect(page.getByText("The guide has faded")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("status")).toContainText("Passed level 1", { timeout: 20_000 });
    await expect(page.locator("article").first()).toContainText(
      "plays on your own, after the guide faded",
    );
  });

  test("feel: ten grooves named in Check", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/music/ear/feel");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByRole("button", { name: /^Start/ }).click();
    const label: Record<string, string> = {
      straight: "Straight",
      swung: "Swung",
      shuffle: "Shuffle",
      "twelve-eight": "12/8",
    };
    for (let i = 0; i < 10; i++) {
      const prompt = page.locator(`article[aria-label="Groove ${i + 1}"][data-step="answer"]`);
      await expect(prompt).toBeVisible({ timeout: 5000 });
      const feel = (await prompt.getAttribute("data-feel"))!;
      await page
        .getByRole("group", { name: "Answers" })
        .getByRole("button", { name: new RegExp(`^${label[feel].replace("/", "\\/")}`) })
        .click();
    }
    await expect(page.getByRole("status")).toContainText("10 of 10", { timeout: 10_000 });
  });

  test("Create: a loop built live in three passes", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/create?live=1");
    const live = page.getByTestId("live-pads");
    await expect(live).toBeVisible();
    const bpm = Number(await page.getByRole("spinbutton").first().inputValue());
    await live.getByRole("button", { name: "Record" }).click();
    await expect(live).toHaveAttribute("data-loop-at", /\d/, { timeout: 10_000 });
    const loopAt = Number(await live.getAttribute("data-loop-at"));
    const beat = 60000 / bpm;
    const pass = 4 * beat;
    // Kick, then snare, then hats, each a pass; a little late as players are.
    const notes: [number, number, number][] = [
      ...[0, 2].map((b) => [36, b * beat + 6, 100] as [number, number, number]),
      ...[1, 3].map((b) => [38, pass + b * beat + 8, 100] as [number, number, number]),
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(
        (b) => [42, 2 * pass + b * beat + 5, 80] as [number, number, number],
      ),
    ];
    await send(page, loopAt, notes);
    await expect(live).toHaveAttribute("data-passes", "3", { timeout: 4 * pass + 5000 });
    await live.getByRole("button", { name: "Keep this loop" }).click();
    await expect(page.locator("p[role=status]")).toContainText("in 3 passes, in time", {
      timeout: 5000,
    });
  });
});
