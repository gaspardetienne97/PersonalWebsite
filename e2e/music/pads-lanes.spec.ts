// The lanes view on the pads (Melodics' lesson screen): one lane per pad, the
// notes sliding onto a hit line, the pads beside lighting the next hit and
// marking each hit early, late or on time. Fake MIDI stamped exactly.
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, installFakeMidi, PORTS } from "./fixtures";

const PORT = PORTS.keys.id;
const SHOTS = process.env.PW_SHOTS ?? "test-results/pads-lanes";

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

/** Start, then play every target at its time, `lateMs` late (stamped, scheduled early). */
async function play(page: Page, lateMs = 0) {
  const stage = page.getByTestId("pads-stage");
  await page.getByRole("button", { name: /^(Start|Again)/ }).click();
  await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
  const targets = JSON.parse((await stage.getAttribute("data-targets"))!) as [
    number,
    number,
    string,
  ][];
  const downbeat = Number(await stage.getAttribute("data-downbeat"));
  await page.evaluate(
    ({ downbeat, targets, port, lateMs }) => {
      for (const [pad, at, kind] of targets) {
        const when = downbeat + at + lateMs;
        const vel = kind === "a" ? 110 : kind === "g" ? 30 : 75;
        setTimeout(
          () => (window as any).__midi.send(port, [0x90, pad, vel], when),
          when - 60 - performance.now(),
        );
        setTimeout(
          () => (window as any).__midi.send(port, [0x80, pad, 0], when + 40),
          when + 10 - performance.now(),
        );
      }
    },
    { downbeat, targets, port: PORT, lateMs },
  );
  return targets;
}

test.describe("the lanes view on the pads", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installFakeMidi(page, [PORTS.keys]);
  });

  test("grooves read as lanes with the pads beside, each hit judged", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/pads?mode=groove&groove=backbeat&bpm=90&view=lanes&ahead=2");
    const highway = page.getByRole("img", { name: /notes coming up$/ });
    // Before the run: the lanes, named with their pads, the pads beside them.
    await expect(highway).toBeVisible();
    await expect(highway).toContainText("Kick");
    await expect(highway).toContainText("A01");
    const pads = page.getByRole("group", { name: /^MPC pads, bank A/ });
    const [h, p] = [await highway.boundingBox(), await pads.boundingBox()];
    expect(p!.x).toBeGreaterThan(h!.x + h!.width - 4);
    await page.screenshot({ path: `${SHOTS}/lanes-ready-1280.png` });

    // A run played 50 ms late: the hits land late, on the lanes and on the pads.
    await play(page, 50);
    await expect(highway.locator('.note[data-judged="late"]').first()).toBeAttached({
      timeout: 5000,
    });
    await expect(pads.locator('.when[data-kind="late"]').first()).toBeAttached({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/lanes-running-1280.png` });
    await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 15_000 });
    // The results read on the grid, every note marked.
    await expect(page.getByRole("region", { name: /The groove, / })).toBeVisible();

    // On time this time: the pads say so.
    await play(page);
    await expect(pads.locator('.when[data-kind="perfect"]').first()).toBeAttached({
      timeout: 5000,
    });
    await expect(page.getByRole("status")).toContainText("Passed level", { timeout: 15_000 });
  });

  test("the grid stays a choice, and the look-ahead sets how far the lanes read", async ({
    page,
  }) => {
    await enableMidi(page, "/music/pads?mode=groove&groove=backbeat&bpm=90");
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    const view = page.getByRole("group", { name: "View" });
    await view.getByRole("button", { name: "Grid" }).click();
    await expect(page.getByRole("region", { name: /The groove, / })).toBeVisible();
    await expect(page.getByRole("img", { name: /notes coming up$/ })).toHaveCount(0);
    await view.getByRole("button", { name: "Lanes" }).click();
    const highway = page.getByRole("img", { name: /notes coming up$/ });
    const bars = async () => highway.locator('.line[data-kind="bar"]').count();
    await page
      .getByRole("group", { name: "Look ahead" })
      .getByRole("button", { name: "1 bar" })
      .click();
    const one = await bars();
    await page
      .getByRole("group", { name: "Look ahead" })
      .getByRole("button", { name: "4 bars" })
      .click();
    expect(await bars()).toBeGreaterThan(one + 2);
  });

  test("triplets and odd meters draw their own grid", async ({ page }) => {
    await enableMidi(page, "/music/pads?mode=groove&groove=seven-eight&bpm=120&view=lanes&ahead=2");
    const highway = page.getByRole("img", { name: /notes coming up$/ });
    // 7/8: seven clicks from one bar line to the next.
    const gaps = await highway.evaluate((el) => {
      const xs = (k: string) =>
        [...el.querySelectorAll<HTMLElement>(`.line[data-kind="${k}"]`)]
          .map((n) => parseFloat(n.style.left))
          .sort((a, b) => a - b);
      const bars = xs("bar");
      const beats = xs("beat").filter((x) => x > bars[0] && x < bars[1]);
      return { beats: beats.length, bar: bars[1] - bars[0], click: beats[1] - beats[0] };
    });
    expect(gaps.beats).toBe(6);
    expect(gaps.bar / gaps.click).toBeCloseTo(7, 1);

    await enableMidi(
      page,
      "/music/pads?mode=groove&groove=blues-shuffle&bpm=90&view=lanes&ahead=1",
    );
    // Triplets: two steps between clicks.
    const steps = await highway.evaluate((el) => {
      const xs = (k: string) =>
        [...el.querySelectorAll<HTMLElement>(`.line[data-kind="${k}"]`)]
          .map((n) => parseFloat(n.style.left))
          .sort((a, b) => a - b);
      const beats = [...xs("beat"), ...xs("bar")].sort((a, b) => a - b);
      return xs("step").filter((x) => x > beats[1] && x < beats[2]).length;
    });
    expect(steps).toBe(2);
    await page.screenshot({ path: `${SHOTS}/lanes-shuffle-1280.png` });
  });

  test("at phone width the pads sit under the lanes with nothing spilling over", async ({
    page,
  }) => {
    await enableMidi(page, "/music/pads?mode=groove&groove=backbeat&bpm=90&view=lanes");
    await page.setViewportSize({ width: 375, height: 800 });
    await page.waitForTimeout(200);
    await expectNoHorizontalOverflow(page);
    const highway = page.getByRole("img", { name: /notes coming up$/ });
    const pads = page.getByRole("group", { name: /^MPC pads, bank A/ });
    const [h, p] = [await highway.boundingBox(), await pads.boundingBox()];
    expect(p!.y).toBeGreaterThan(h!.y + h!.height - 4);
    await page.screenshot({ path: `${SHOTS}/lanes-375.png`, fullPage: true });
  });

  test("fills and chop offer the lanes too", async ({ page }) => {
    await enableMidi(page, "/music/pads?mode=fills&view=lanes");
    await expect(page.getByRole("img", { name: /notes coming up$/ })).toContainText("Crash");
    await page.screenshot({ path: `${SHOTS}/lanes-fills-1280.png` });
    await enableMidi(page, "/music/pads?mode=chop&exercise=reorder&view=lanes");
    const highway = page.getByRole("img", { name: /slices: notes coming up$/ });
    await expect(highway).toContainText("Slice 1");
    // A slice rings until the next: drawn as a line.
    await expect(highway.locator(".hold").first()).toBeAttached();
    await page.screenshot({ path: `${SHOTS}/lanes-chop-1280.png` });
  });
});

test("song studio: a drum part as lanes, with the pads beside marking each hit", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await installFakeMidi(page, [PORTS.keys]);
  await page.goto("/music");
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("woodshed");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("settings", "readwrite");
          const store = tx.objectStore("settings");
          const get = store.get("music.settings");
          get.onsuccess = () =>
            store.put({
              id: "music.settings",
              value: {
                ...get.result?.value,
                midiEnabledBefore: true,
                activeInstrument: "mpc",
                countInBars: 1,
              },
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  // Kick and closed hat, snare, open hat, kick (e2e/music/fixtures/back-beat.mid).
  await page.goto("/music/library?tab=import");
  await page.getByLabel("Score file").setInputFiles("e2e/music/fixtures/back-beat.mid");
  await page.getByRole("button", { name: "Save to songs" }).click();
  await expect(page.getByText("Back beat is in your songs.")).toBeVisible();
  await page.goto("/music/library");
  await page
    .getByRole("link", { name: /Back beat/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Back beat" })).toBeVisible();
  await page.goto(page.url().split("?")[0] + "?mode=performance&takes=1&bpm=240");
  // The grid first; Lanes one tap away, remembered.
  await expect(page.locator("[data-drum-grid]")).toBeVisible();
  await page
    .getByRole("group", { name: "Drum view" })
    .getByRole("button", { name: "Lanes" })
    .click();
  const highway = page.getByRole("img", { name: /notes coming up$/ });
  await expect(highway).toContainText("Open Hat");
  await expect(page.getByRole("group", { name: /^MPC pads, bank A/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/studio-lanes-1280.png` });

  await page.getByRole("button", { name: "Start performance" }).click();
  const stage = page.getByTestId("studio-stage");
  await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 8000 });
  const downbeat = Number(await stage.getAttribute("data-downbeat"));
  // Every hit 50 ms late.
  await page.evaluate(
    ({ downbeat, port }) => {
      const hits: [number[], number][] = [
        [[36, 42], 0],
        [[38], 250],
        [[46], 500],
        [[36], 750],
      ];
      for (const [pads, at] of hits)
        for (const pad of pads) {
          const when = downbeat + at + 50;
          setTimeout(
            () => (window as any).__midi.send(port, [0x90, pad, 96], when),
            when - 60 - performance.now(),
          );
          setTimeout(
            () => (window as any).__midi.send(port, [0x80, pad, 0], when + 60),
            when - performance.now(),
          );
        }
    },
    { downbeat, port: PORTS.keys.id },
  );
  await expect(page.locator('.when[data-kind="late"]').first()).toBeAttached({ timeout: 5000 });
  await page.screenshot({ path: `${SHOTS}/studio-lanes-running-1280.png` });
  await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByRole("img", { name: /notes coming up$/ })).toBeVisible();
});
