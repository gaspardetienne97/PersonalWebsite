// Accompaniment: hand patterns, comping over changes and a lead sheet, each run
// start to results over a fake Web MIDI keyboard with stamped notes.
import { expect, test, type Page } from "@playwright/test";
import {
  PORTS,
  expectNoHorizontalOverflow,
  installFakeMidi,
  pickMode,
  setupLine,
} from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/piano";

/** Remember MIDI as enabled and the piano as the strip's instrument. */
async function enableMidi(page: Page) {
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
              value: { ...get.result?.value, midiEnabledBefore: true, activeInstrument: "piano" },
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

/** Start in Practice, then play every slot from the run's own downbeat, stamped. */
async function playSlots(page: Page, opts: { drop?: (beat: number) => boolean } = {}) {
  await pickMode(page, "Practice");
  await page.getByRole("button", { name: /^(Start|Again)$/ }).click();
  const stage = page.getByTestId("accompany");
  await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
  const slots = JSON.parse((await stage.getAttribute("data-slots"))!) as [number, number[]][];
  const downbeat = Number(await stage.getAttribute("data-downbeat"));
  const beatMs = Number(await stage.getAttribute("data-beat-ms"));
  const kept = slots.filter(([beat]) => !opts.drop?.(beat));
  await page.evaluate(
    ({ slots, downbeat, beatMs, port }) => {
      const midi = (window as any).__midi;
      for (const [beat, notes] of slots) {
        const at = downbeat + beat * beatMs;
        setTimeout(
          () => notes.forEach((n, k) => midi.send(port, [0x90, n, 90], at + k * 3)),
          at - 80 - performance.now(),
        );
        setTimeout(
          () => notes.forEach((n) => midi.send(port, [0x80, n, 0])),
          at + beatMs * 0.4 - performance.now(),
        );
      }
    },
    { slots: kept, downbeat, beatMs, port: PORTS.keys.id },
  );
}

test.describe("accompaniment over fake MIDI", () => {
  test.setTimeout(90_000);
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/.*/, () => {});
    await installFakeMidi(page, [PORTS.keys]);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await enableMidi(page);
  });

  test("patterns: root, fifth, octave over I-V-vi-IV in D", async ({ page }) => {
    await page.goto(
      "/music/accompany?mode=patterns&pattern=root-fifth-octave&progression=pop-axis&transpose=2&hands=both&bpm=120",
    );
    await expect(page.getByRole("heading", { level: 1, name: "Accompaniment" })).toBeVisible();
    await expect(page.getByText("over I-V-vi-IV in D")).toBeVisible();
    await playSlots(page);
    await expect(page.getByRole("status")).toContainText("Clean at 120 BPM", { timeout: 30_000 });
    await expect(page.getByText("32 of 32", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/accompany-patterns-results-1280.png`, fullPage: true });
  });

  test("patterns: a missed bar is named", async ({ page }) => {
    await page.goto(
      "/music/accompany?mode=patterns&pattern=block-1-3&progression=pop-axis&transpose=0&hands=both&bpm=120",
    );
    await playSlots(page, { drop: (beat) => beat >= 8 && beat < 12 });
    await expect(page.getByRole("status")).toContainText("bar 3 lost the most", {
      timeout: 30_000,
    });
  });

  test("comping: alternating shells on the blues, Charleston, swung", async ({ page }) => {
    await page.goto(
      "/music/accompany?mode=comping&voicing=shells&rhythm=charleston&feel=swing&progression=blues&transpose=0&bpm=140",
    );
    // One clause of the setup sentence, whole.
    await expect(setupLine(page)).toContainText(/(: |, )Shells, alternating on charleston(, |$)/);
    await playSlots(page);
    await expect(page.getByRole("status")).toContainText("Clean at 140 BPM", { timeout: 40_000 });
    await expect(page.getByText("24 of 24", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/accompany-comping-results-1280.png`, fullPage: true });
  });

  test("lead sheet: Twinkle with left-hand roots", async ({ page }) => {
    await page.goto(
      "/music/accompany?mode=lead-sheet&tune=twinkle&lh=roots&hands=both&transpose=0&bpm=140",
    );
    await expect(page.getByTestId("line-staff")).toBeVisible();
    await playSlots(page);
    await expect(page.getByRole("status")).toContainText("Clean at 140 BPM", { timeout: 40_000 });
    await expect(page.getByText("42 of 42", { exact: true })).toBeVisible();
    await page.screenshot({
      path: `${SHOTS}/accompany-lead-sheet-results-1280.png`,
      fullPage: true,
    });
  });
});

test("every tab loads at 375 without sideways scroll", async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
  await page.setViewportSize({ width: 375, height: 900 });
  for (const tab of ["patterns", "comping", "lead-sheet"]) {
    await page.goto(`/music/accompany?mode=${tab}`);
    await expect(page.getByRole("heading", { level: 1, name: "Accompaniment" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/accompany-${tab}-375.png`, fullPage: true });
  }
});
