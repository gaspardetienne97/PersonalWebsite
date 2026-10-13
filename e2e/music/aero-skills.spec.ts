// The Aerophone skills beyond lessons and breath holds: timed scales,
// tonguing told apart by the breath, register crossings, trills, bite vibrato
// and a long tone at a level, over fake MIDI stamped exactly.
import { expect, test, type Page } from "@playwright/test";
import { installFakeMidi, PORTS } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/aero-skills";
const PORT = PORTS.aerophone.id;

async function enableMidi(page: Page, url: string) {
  await page.goto(url);
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
        open.onerror = () => reject(open.error);
      }),
  );
  await page.reload();
  await expect(page.getByTestId("midi-status")).toContainText("Listening on Aerophone", {
    timeout: 10_000,
  });
}

/** Start, then play the stage's line in time; `tongue` marks which notes start with a stop. */
async function playLine(page: Page, tongue?: string) {
  const stage = page.getByTestId("aero-skills");
  await page.getByRole("button", { name: /^(Start|Again)/ }).click();
  await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
  const line = (await stage.getAttribute("data-line"))!.split(",").map(Number);
  const stepMs = Number(await stage.getAttribute("data-step-ms"));
  const downbeat = Number(await stage.getAttribute("data-downbeat"));
  await page.evaluate(
    ({ line, stepMs, downbeat, port, tongue }) => {
      const send = (bytes: number[], at: number) =>
        setTimeout(() => (window as any).__midi.send(port, bytes, at), at - 80 - performance.now());
      line.forEach((midi, i) => {
        const at = downbeat + i * stepMs;
        const stop = !tongue || tongue[i % tongue.length] === "T";
        if (i > 0) send([0x80, line[i - 1], 0], stop ? at - 60 : at + 5);
        if (stop && i > 0) send([0xb0, 2, 10], at - 30);
        send([0x90, midi, 90], at);
        send([0xb0, 2, 80], at + 20);
        send([0xb0, 2, 80], at + stepMs / 2);
      });
      send([0x80, line.at(-1)!, 0], downbeat + line.length * stepMs);
    },
    { line, stepMs, downbeat, port: PORT, tongue },
  );
}

test.describe("aerophone skills", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
    await installFakeMidi(page, [PORTS.aerophone]);
  });

  test("scales: C major up and down, in time", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/aerophone?mode=scales&scale=major&key=0&perBeat=1&bpm=120");
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await playLine(page);
    await expect(page.getByRole("status")).toContainText("Clean and even at 120 BPM", {
      timeout: 20_000,
    });
    await page.screenshot({ path: `${SHOTS}/scales-1280.png`, fullPage: true });
  });

  test("next run: two clean scales at the goal move on to two notes a click", async ({ page }) => {
    test.setTimeout(90_000);
    await enableMidi(page, "/music/aerophone?mode=scales&scale=major&key=0&perBeat=1&bpm=120");
    await playLine(page);
    await expect(page.getByTestId("next-run")).toContainText("1 more clean run to move on", {
      timeout: 20_000,
    });
    await playLine(page);
    const move = page.getByRole("button", { name: "Move on: Two notes a click at 69 BPM" });
    await expect(move).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: `${SHOTS}/next-run-1280.png`, fullPage: true });
    await move.click();
    // The run starts at once: two notes a click at 69 BPM is a 435 ms step.
    await expect(page.getByTestId("aero-skills")).toHaveAttribute("data-step-ms", "435");
    await expect(page.getByRole("button", { name: /^Stop/ })).toBeVisible();
  });

  test("tonguing: slur two, tongue two, read from the breath", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/aerophone?mode=tonguing&tongue=slur2-tongue2&key=7&bpm=90");
    await playLine(page, "TSTT");
    await expect(page.locator("article").first()).toContainText("Tongued and slurred as marked", {
      timeout: 20_000,
    });
    await expect(page.locator("article").first()).toContainText("100%");
    await expect(page.getByRole("status")).toContainText("Clean and even");
    await page.screenshot({ path: `${SHOTS}/tonguing-1280.png`, fullPage: true });
  });

  test("register: C#5 to D5 with no glitches", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/aerophone?mode=register&pair=cs5-d5&bpm=80");
    await playLine(page);
    await expect(page.getByRole("status")).toContainText("Clean and even at 80 BPM", {
      timeout: 20_000,
    });
    await expect(page.locator("article").first()).toContainText("Glitches across the break");
  });

  test("trills: G4 and A4, fast and even", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/aerophone?mode=trills&trill=g4-a4");
    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(page.getByRole("status")).toContainText("the clock starts on your first note");
    await page.evaluate((port) => {
      const t0 = performance.now() + 200;
      for (let i = 0; i < 36; i++) {
        const at = t0 + i * 120;
        const midi = i % 2 ? 69 : 67;
        setTimeout(
          () => {
            (window as any).__midi.send(port, [0x90, midi, 90], at);
            (window as any).__midi.send(port, [0x80, midi, 0], at + 100);
          },
          at - 80 - performance.now(),
        );
      }
    }, PORT);
    await expect(page.getByRole("status")).toContainText("notes a second, even", {
      timeout: 20_000,
    });
    await page.screenshot({ path: `${SHOTS}/trills-1280.png`, fullPage: true });
  });

  test("vibrato: four pulses a click at 60 from the bite", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/aerophone?mode=vibrato&vib=4-at-60&vibNote=67");
    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(page.getByRole("status")).toContainText("pulse the bite 4 times");
    await page.evaluate((port) => {
      const t0 = performance.now() + 200;
      const send = (bytes: number[], at: number) =>
        setTimeout(() => (window as any).__midi.send(port, bytes, at), at - 80 - performance.now());
      send([0x90, 67, 90], t0);
      for (let i = 0; i < 250; i++) {
        const at = t0 + i * 20;
        const v = 0.2 * Math.sin((2 * Math.PI * 4 * i * 20) / 1000);
        const raw = Math.min(16383, Math.round((v + 1) * 8192));
        send([0xe0, raw & 127, raw >> 7], at);
      }
      send([0x80, 67, 0], t0 + 5000);
    }, PORT);
    await expect(page.getByRole("status")).toContainText("4 pulses a click, even", {
      timeout: 20_000,
    });
    await page.screenshot({ path: `${SHOTS}/vibrato-1280.png`, fullPage: true });
  });

  test("long tone at mf: breath inside the band", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/aerophone?mode=long-tone&target=67&seconds=3&level=mf");
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(page.getByRole("status")).toContainText("Play and hold G4");
    await page.evaluate((port) => {
      const send = (b: number[]) => (window as any).__midi.send(port, b);
      send([0x90, 67, 90]);
      let i = 0;
      const t = setInterval(() => {
        send([0xb0, 2, 70 + ((i++ % 3) - 1)]);
        if (i > 68) {
          clearInterval(t);
          send([0x80, 67, 0]);
        }
      }, 50);
    }, PORT);
    await expect(page.getByRole("status")).toContainText("Steady G4 for 3 seconds.", {
      timeout: 10_000,
    });
    await expect(page.locator("article").first()).toContainText("Breath at mf");
    await page.screenshot({ path: `${SHOTS}/long-tone-mf-1280.png`, fullPage: true });
  });
});
