// Drill helpers for the hub, ear, rhythm and reading captures: settings seeded the way
// the app stores them, MIDI switched on as a returning user has it, and answers read
// from the same data attributes the e2e suite uses.
import { expect, type Page } from "@playwright/test";
import { installFakeMidi, midiNote, muteHmr, PORTS } from "../../../e2e/music/fixtures";
import { jitter, lessons, mode, open, shot, startTheme, VIEWPORTS, type Width } from "./lib";

export { installFakeMidi, midiNote, muteHmr, PORTS };
export const WIDTHS: Width[] = ["desktop", "phone"];
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** A fresh page at a width, theme light, HMR muted, lessons on or off. */
export async function setup(page: Page, width: Width, opts: { lessons?: boolean } = {}) {
  await muteHmr(page);
  await startTheme(page, "light");
  await lessons(page, opts.lessons ?? false);
  await page.setViewportSize(VIEWPORTS[width]);
}

/** Patch the stored settings (IndexedDB `woodshed` / `settings` / `music.settings`). */
export async function patchSettings(page: Page, patch: Record<string, unknown>) {
  await expect(async () => {
    await page.evaluate(
      (patch) =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open("woodshed");
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            try {
              const tx = req.result.transaction("settings", "readwrite");
              const store = tx.objectStore("settings");
              const get = store.get("music.settings");
              get.onsuccess = () =>
                store.put({ id: "music.settings", value: { ...get.result?.value, ...patch } });
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
            } catch (e) {
              reject(e);
            } finally {
              req.result.close();
            }
          };
        }),
      patch,
    );
  }).toPass({ timeout: 15_000 });
}

/**
 * Open `url` as a returning MIDI user: the fake keyboard is installed, MIDI was enabled
 * before (so it re-opens on load), and the count-in is as given (default 1 bar).
 */
export async function openWithMidi(
  page: Page,
  url: string,
  opts: { countInBars?: number; ports?: (typeof PORTS)[keyof typeof PORTS][] } = {},
) {
  await installFakeMidi(page, opts.ports ?? [PORTS.keys]);
  await open(page, url);
  await patchSettings(page, { midiEnabledBefore: true, countInBars: opts.countInBars ?? 1 });
  await page.reload();
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(600);
}

export const startBtn = (page: Page) =>
  page.getByRole("button", { name: /^(Start|Again)$/, exact: false });

/** Leave any lesson or results, then switch the mode and see it pressed (fails if it will not). */
export const pickMode = mode;

/** Skip the intro lesson if it shows (it is marked seen, as a user would). */
export async function skipLesson(page: Page) {
  const skip = page.getByRole("button", { name: "Skip, I know this" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

export async function lessonVisible(page: Page) {
  return page
    .getByTestId("lesson")
    .isVisible()
    .catch(() => false);
}

/** Shoot the intro lesson (lessons on) if this drill has one; returns whether it did. */
export async function shootLesson(page: Page, flow: string, width: Width) {
  try {
    await expect(page.getByTestId("lesson")).toBeVisible({ timeout: 8000 });
  } catch {
    return false;
  }
  await page.waitForTimeout(400);
  await toStage(page, "[data-testid=lesson]");
  await shot(page, flow, "lesson", width);
  return true;
}

/**
 * During a run the stage owns the screen from the top; scroll to the top, then, if
 * `focus` is given and sits below the fold, scroll just enough to show it.
 */
export async function toStage(page: Page, focus?: string) {
  await page.evaluate((sel) => {
    window.scrollTo(0, 0);
    const el = sel ? document.querySelector(sel) : null;
    // Scroll only as far as it takes to bring it above the phone's sticky Stop bar.
    const over = el
      ? el.getBoundingClientRect().bottom -
        (window.innerHeight - (window.innerWidth < 1024 ? 110 : 8))
      : 0;
    if (over > 0) window.scrollBy(0, over);
  }, focus ?? null);
  await page.waitForTimeout(200);
}

export async function toTop(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
}

/** Wait until the results are on screen and scroll them to the top. */
export async function toResults(page: Page) {
  await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 30_000 });
  await page.waitForTimeout(900); // the results fade in, a clean run's burst plays
  await toTop(page);
  // On a phone the drill header fills the first screen: bring the results card up under
  // the sticky strip, where a player would scroll to read it.
  await page.evaluate(() => {
    const target = document.querySelector(".results-enter");
    if (innerWidth >= 1024 || !target) return;
    window.scrollTo(0, target.getBoundingClientRect().top + scrollY - 240);
    let el = document.elementFromPoint(innerWidth / 2, 2);
    let bottom = 0;
    while (el) {
      const pos = getComputedStyle(el).position;
      if (pos === "sticky" || pos === "fixed") {
        bottom = el.getBoundingClientRect().bottom;
        break;
      }
      el = el.parentElement;
    }
    window.scrollTo(0, target.getBoundingClientRect().top + scrollY - bottom - 8);
  });
  await page.waitForTimeout(150);
}

// ---------------------------------------------------------------------------
// Ear drills

export const earCard = (page: Page) => page.locator("article[data-drill]");

/** The label the app shows for an answer token (its own tokenLabel, loaded from the dev server). */
async function earLabel(page: Page, drill: string, token: string) {
  return page.evaluate(
    async ([drill, token]) => {
      const path = "/src/lib/music/drills/ear/session.ts"; // served by the dev server
      const m = await import(/* @vite-ignore */ path);
      return m.tokenLabel(drill, token) as string;
    },
    [drill, token] as const,
  );
}

/** Answer the current ear question by clicking (right or wrong). */
export async function answerEar(page: Page, right: boolean) {
  const card = earCard(page);
  const drill = (await card.getAttribute("data-drill"))!;
  const answer = (await card.getAttribute("data-answer"))!;
  if (drill === "scale-degree") {
    const group = page.getByRole("group", { name: "Scale degrees" });
    const buttons = group.getByRole("button");
    if (right) await group.getByRole("button", { name: new RegExp(`^${answer} `) }).click();
    else {
      const names = await buttons.evaluateAll((bs) =>
        bs
          .filter((b) => !(b as HTMLButtonElement).disabled)
          .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? ""),
      );
      const wrong = names.findIndex((n) => !n.trim().startsWith(`${answer} `));
      await group.getByRole("button", { name: names[wrong].trim(), exact: true }).first().click();
    }
    return;
  }
  const label = await earLabel(page, drill, answer);
  const choices = page.locator("button.choice");
  const texts = (await choices.allTextContents()).map((t) => t.trim());
  let i = texts.findIndex((t) => t === label);
  if (i < 0) i = texts.findIndex((t) => t.startsWith(label));
  if (!right) i = texts.findIndex((t, k) => k !== i && t !== "Undo");
  expect(
    i,
    `no choice for ${drill} ${answer} (${label}) in ${texts.join(" | ")}`,
  ).toBeGreaterThanOrEqual(0);
  await choices.nth(i).click();
}

/** Wait for the question to be asked (it plays first). */
export async function earQuestion(page: Page, n: number) {
  const card = earCard(page);
  await expect(card).toHaveAttribute("aria-label", `Question ${n}`, { timeout: 15_000 });
  await expect(card).toHaveAttribute("data-step", "answer", { timeout: 15_000 });
}

/** In Practice: after feedback, Continue (or See results on the last). */
export async function earContinue(page: Page) {
  const b = page.getByRole("button", { name: /^(Continue|See results)/ }).first();
  if (await b.isVisible().catch(() => false)) await b.click();
  // Round 2 docks Continue under the answers on a phone; Enter continues wherever it sits.
  else await page.keyboard.press("Enter");
}

// ---------------------------------------------------------------------------
// Timed input over the fake MIDI keyboard

/**
 * Play `midi` at each of `times` (performance.now() ms), each note sent a little early
 * and stamped with its exact time, so timers under load cannot skew it (as the e2e does).
 */
export async function playAt(page: Page, times: number[], midi = 60, port = PORTS.keys.id) {
  times = times.map((t, i) => t + jitter(i));
  await page.evaluate(
    ({ times, midi, port }) => {
      const m = (window as any).__midi;
      for (const at of times)
        setTimeout(
          () => {
            m.send(port, [0x90, midi, 100], at);
            setTimeout(() => m.send(port, [0x80, midi, 0], at + 90), 90);
          },
          Math.max(0, at - 60 - performance.now()),
        );
    },
    { times, midi, port },
  );
}

/** The rhythm stage's downbeat once a run (or the next run) has set it. */
export async function rhythmDownbeat(page: Page, before: string | null) {
  const stage = page.locator("[data-beat-ms]").first();
  await expect
    .poll(
      async () => {
        const v = await stage.getAttribute("data-downbeat");
        return v !== null && v !== before && Number(v) > 0;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return {
    downbeat: Number(await stage.getAttribute("data-downbeat")),
    beatMs: Number(await stage.getAttribute("data-beat-ms")),
    onsets: ((await stage.getAttribute("data-onsets")) ?? "")
      .split(",")
      .filter(Boolean)
      .map(Number),
  };
}

/** Wait until performance.now() in the page passes `at`. */
export async function waitUntil(page: Page, at: number) {
  const now = await page.evaluate(() => performance.now());
  if (at > now) await page.waitForTimeout(at - now);
}

/** Press Space (the on-screen Tap) at each of `times`; counts whatever the instrument's input. */
export async function spaceAt(page: Page, times: number[]) {
  times = times.map((t, i) => t + jitter(i));
  await page.evaluate((times) => {
    for (const at of times)
      setTimeout(
        () =>
          document.body.dispatchEvent(
            new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }),
          ),
        Math.max(0, at - performance.now()),
      );
  }, times);
}

/**
 * Arm taps before pressing Start: the page itself watches the rhythm stage for the run's
 * new data-downbeat and schedules each tap from it, so no round trip makes the first
 * beats late. `beats` in beats from the downbeat ("onsets" reads the stage's own),
 * `off` shifts tap i by ms. Returns the downbeat seen before Start.
 */
export async function armTaps(
  page: Page,
  beats: number[] | "onsets",
  opts: { via?: "midi" | "space"; off?: Record<number, number>; midi?: number } = {},
) {
  return page.evaluate(
    ({ beats, via, off, jit, midi, port }) => {
      const stage = () => document.querySelector("[data-beat-ms]");
      const before = stage()?.getAttribute("data-downbeat") ?? null;
      const fire = (at: number) => {
        if (via === "space")
          document.body.dispatchEvent(
            new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }),
          );
        else {
          const m = (window as any).__midi;
          m.send(port, [0x90, midi, 100], at);
          setTimeout(() => m.send(port, [0x80, midi, 0], at + 90), 90);
        }
      };
      const t = setInterval(() => {
        const s = stage();
        const v = s?.getAttribute("data-downbeat");
        if (!s || !v || v === before || Number(v) <= 0) return;
        clearInterval(t);
        const db = Number(v);
        const bm = Number(s.getAttribute("data-beat-ms"));
        const bs =
          beats === "onsets"
            ? (s.getAttribute("data-onsets") ?? "").split(",").filter(Boolean).map(Number)
            : beats;
        bs.forEach((b, i) => {
          const at = db + b * bm + (off[i] ?? 0) + jit[i % jit.length];
          // MIDI goes a little early, stamped with its exact time; Space fires on time.
          const lead = via === "space" ? 0 : 60;
          setTimeout(() => fire(at), Math.max(0, at - lead - performance.now()));
        });
      }, 10);
      setTimeout(() => clearInterval(t), 60_000);
      return before;
    },
    {
      beats,
      via: opts.via ?? "midi",
      off: opts.off ?? {},
      // A player's few ms on every tap, so the per-beat rows are not all 0 ms.
      jit: Array.from({ length: 64 }, (_, i) => jitter(i)),
      midi: opts.midi ?? 60,
      port: PORTS.keys.id,
    },
  );
}
