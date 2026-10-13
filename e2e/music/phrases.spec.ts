// Popular phrases: hear one, play it back over fake MIDI stamped exactly; the
// line is a staff on piano and the Aerophone, tab on guitar and ukulele.
import { expect, test, type Page } from "@playwright/test";
import { choose, installFakeMidi, PORTS } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/phrases";

async function setup(page: Page, url: string) {
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
              value: {
                ...get.result?.value,
                midiEnabledBefore: true,
                countInBars: 0,
                activeInstrument: "piano",
              },
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  await page.reload();
}
const pick = (page: Page, instrument: string) =>
  choose(
    page,
    page.getByRole("group", { name: "Practice controls" }).getByLabel("Instrument"),
    instrument,
  );

test.describe("phrases", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
    await installFakeMidi(page, [PORTS.keys]);
  });

  test("Ode to Joy on the piano: heard, then played back in order and on time", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await setup(page, "/music/phrases?phrase=piano.ode-to-joy&bpm=100");
    const stage = page.getByTestId("phrase");
    await expect(stage).toContainText("Ode to Joy");
    await expect(page.getByTestId("line-staff").locator("svg")).toBeVisible();
    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
    const notes = JSON.parse((await stage.getAttribute("data-notes"))!) as [number, number][];
    const downbeat = Number(await stage.getAttribute("data-downbeat"));
    const beatMs = Number(await stage.getAttribute("data-beat-ms"));
    await page.evaluate(
      ({ notes, downbeat, beatMs, port }) => {
        for (const [midi, beat] of notes) {
          const at = downbeat + beat * beatMs;
          setTimeout(
            () => {
              (window as any).__midi.send(port, [0x90, midi, 90], at);
              (window as any).__midi.send(port, [0x80, midi, 0], at + beatMs * 0.4);
            },
            at - 80 - performance.now(),
          );
        }
      },
      { notes, downbeat, beatMs, port: PORTS.keys.id },
    );
    await expect(page.getByRole("status")).toContainText("15 of 15 in order", { timeout: 20_000 });
    await page.screenshot({ path: `${SHOTS}/piano-ode-1280.png`, fullPage: true });
  });

  test("the list follows the strip: tab on guitar, the staff and fingering on the Aerophone", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await setup(page, "/music/phrases");
    await pick(page, "Guitar");
    await expect(page.getByTestId("phrase")).toContainText("Twinkle");
    await expect(page.getByTestId("line-tab").locator("svg")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/guitar-1280.png`, fullPage: true });
    await pick(page, "Aerophone");
    await expect(page.getByTestId("phrase")).toContainText("Hot Cross Buns");
    await expect(page.getByTestId("line-staff").locator("svg")).toBeVisible();
    await expect(page.getByTestId("aerophone-fingering")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/aerophone-1280.png`, fullPage: true });
  });

  test("on MPC pads the phrases are drum phrases, played on the pads", async ({ page }) => {
    test.setTimeout(60_000);
    await setup(page, "/music/phrases?phrase=son-clave&bpm=100");
    await pick(page, "MPC pads");
    // The strip stays on the pads: the drill is for them too.
    await expect(
      page.getByRole("group", { name: "Practice controls" }).getByLabel("Instrument"),
    ).toContainText("MPC pads");
    const stage = page.getByTestId("pad-skills");
    await expect(stage).toContainText("Son clave 3-2");
    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
    const targets = JSON.parse((await stage.getAttribute("data-targets"))!) as [
      number,
      number,
      string,
    ][];
    const downbeat = Number(await stage.getAttribute("data-downbeat"));
    await page.evaluate(
      ({ targets, downbeat, port }) => {
        for (const [pad, at] of targets) {
          const when = downbeat + at;
          setTimeout(
            () => (window as any).__midi.send(port, [0x90, pad, 90], when),
            when - 60 - performance.now(),
          );
          setTimeout(
            () => (window as any).__midi.send(port, [0x80, pad, 0], when + 30),
            when - 30 - performance.now(),
          );
        }
      },
      { targets, downbeat, port: PORTS.keys.id },
    );
    await expect(page.getByRole("status")).toContainText("Clean", { timeout: 20_000 });
    await page.screenshot({ path: `${SHOTS}/mpc-son-clave-1280.png`, fullPage: true });
  });
});
