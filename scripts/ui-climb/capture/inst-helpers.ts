// Helpers for the instrument-drill captures (instruments*.spec.ts): a fresh page set
// up as a real player's would be (MIDI remembered, the strip on an instrument),
// notes played over the fake MIDI device stamped to the run's own downbeat, and
// small waits for the states the judges look at.
import { expect, type Page } from "@playwright/test";
import {
  choose,
  installFakeMidi,
  installSyntheticMic,
  muteHmr,
  PORTS,
  type FakePort,
} from "../../../e2e/music/fixtures";
import { hasCheck, jitter, mode, shot, think, startTheme, VIEWPORTS, type Width } from "./lib";

export { hasCheck, mode, PORTS, shot, think, VIEWPORTS, type Width };
/** Instrument drills: laptop and tablet landscape (usable on a phone, but not shot there). */
export const WIDTHS: Width[] = ["desktop", "tablet"];
export const KEYS = PORTS.keys.id;
export const AERO = PORTS.aerophone.id;

export interface Prep {
  /** Fake MIDI inputs (none when left out). */
  midi?: FakePort[];
  /** A synthetic microphone starting at this pitch (Hz; 0 is silence). */
  mic?: number;
  /** The practice strip's instrument. */
  instrument?: "piano" | "guitar" | "ukulele" | "mpc" | "aerophone";
  /** Count-in bars (the app's default when left out). */
  countIn?: number;
  /** Extra saved settings. */
  settings?: Record<string, unknown>;
}

/**
 * Intro lessons are switched by a per-tab flag, so one test can show a lesson and then
 * turn lessons off for the rest of its runs (localStorage `woodshed.lessons`).
 */
async function lessonSwitch(page: Page) {
  await page.addInitScript(() => {
    const on = sessionStorage.getItem("cap.lessons") === "on";
    localStorage.setItem("woodshed.lessons", on ? "on" : "off");
  });
}

/** Turn intro lessons on or off from the next navigation on. */
export async function lessons(page: Page, on: boolean) {
  await page.evaluate((on) => {
    sessionStorage.setItem("cap.lessons", on ? "on" : "off");
    localStorage.setItem("woodshed.lessons", on ? "on" : "off");
  }, on);
}

async function seed(page: Page, value: Record<string, unknown>) {
  await page.evaluate(
    (value) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("woodshed");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("settings", "readwrite");
          const store = tx.objectStore("settings");
          const get = store.get("music.settings");
          get.onsuccess = () =>
            store.put({ id: "music.settings", value: { ...get.result?.value, ...value } });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    value,
  );
}

/** A fresh page at `width`, light theme, lessons off, inputs installed and remembered. */
export async function prep(page: Page, width: Width, opts: Prep = {}) {
  await muteHmr(page);
  await page.setViewportSize(VIEWPORTS[width]);
  await startTheme(page, "light");
  await lessonSwitch(page);
  if (opts.midi) await installFakeMidi(page, opts.midi);
  if (opts.mic !== undefined) await installSyntheticMic(page, opts.mic);
  await page.goto("/music");
  await page.waitForLoadState("networkidle");
  const value: Record<string, unknown> = { ...opts.settings };
  if (opts.midi) value.midiEnabledBefore = true;
  if (opts.instrument) value.activeInstrument = opts.instrument;
  if (opts.countIn !== undefined) value.countInBars = opts.countIn;
  // The dev server can reload once while it optimises dependencies; retry past that.
  for (let i = 0; ; i++) {
    try {
      await seed(page, value);
      return;
    } catch (e) {
      if (i >= 3) throw e;
      await page.waitForTimeout(800);
      await page.waitForLoadState("networkidle");
    }
  }
}

/** Open a drill and wait until it has settled (heading, fonts, the stage drawn). */
export async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeAttached({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

/** Pick the strip's instrument from its dropdown. */
export async function pickInstrument(page: Page, label: string) {
  await choose(
    page,
    page.getByRole("group", { name: "Practice controls" }).getByLabel("Instrument"),
    label,
  );
}

export const lessonView = (page: Page) => page.getByTestId("lesson");

/** Skip the intro lesson if one is showing. */
export async function skipLesson(page: Page) {
  const skip = page.getByRole("button", { name: "Skip, I know this" });
  if (await skip.isVisible()) await skip.click();
}

export const startButton = (page: Page) =>
  page.getByRole("button", { name: /^(Start|Again)$/ }).first();

/** Results are on screen (the shell's sr-only heading, or a drill's own card). */
export async function waitResults(page: Page, timeout = 30_000) {
  await expect(page.getByRole("heading", { name: "Results" }).first()).toBeAttached({ timeout });
  // The results slide in and a clean run bursts stars; shoot the settled frame.
  await page.waitForTimeout(900);
  await showResults(page);
}

/**
 * From the top, scroll just far enough that the run's actions (the next run, Again)
 * are in view under the results, as a player would before tapping them.
 */
export async function showResults(page: Page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const bar = [...document.querySelectorAll<HTMLElement>('[data-testid="drill-bar"]')].find(
      (b) => b.offsetParent,
    );
    if (!bar || getComputedStyle(bar).position === "sticky") return;
    const r = bar.getBoundingClientRect();
    if (r.bottom > innerHeight - 8) window.scrollTo(0, r.bottom - innerHeight + 24);
  });
  await page.waitForTimeout(150);
}

/** A run with nothing played ends on the not-heard card. */
export async function waitSilent(page: Page, timeout = 60_000) {
  await expect(
    // Some drills still say it their own way (pads fills and chop): any of these is the silent run.
    page
      .getByTestId("not-heard")
      .or(
        page.getByText(
          /^(Nothing was heard|No hits arrived|Nothing to measure|Nothing was played)/,
        ),
      )
      .first(),
  ).toBeVisible({ timeout });
  await page.waitForTimeout(500);
  await showResults(page);
}

/** Wait until the stage's run has a downbeat (a fresh one after Start). */
export async function downbeatOf(page: Page, selector: string, after = 0) {
  const el = page.locator(selector).first();
  await expect
    .poll(async () => Number((await el.getAttribute("data-downbeat")) ?? 0), { timeout: 15_000 })
    .toBeGreaterThan(after);
  return Number(await el.getAttribute("data-downbeat"));
}

/** Milliseconds until `perf` (a performance.now() time) in the page. */
export async function untilPerf(page: Page, perf: number) {
  const now = await page.evaluate(() => performance.now());
  return perf - now;
}

/** Sleep until `perf` in the page's clock, plus `extra` ms. */
export async function waitPerf(page: Page, perf: number, extra = 0) {
  const ms = (await untilPerf(page, perf)) + extra;
  if (ms > 0) await page.waitForTimeout(ms);
}

export type Note = [midi: number, at: number, hold?: number, velocity?: number];
/** Raw MIDI bytes at an absolute page time (breath, aftertouch, controllers). */
export type Raw = { bytes: number[]; at: number };
export type Send = Note | Raw;

/**
 * Notes over fake MIDI at absolute page times (`at`, performance.now() ms), each sent a
 * little early and stamped with its exact time, so a busy machine stays on the beat.
 */
export async function sendAt(page: Page, port: string, sends: Send[]) {
  // A player's few ms on each note (and each raw note-on), so per-beat rows are not all 0 ms.
  const notes = sends
    .filter((x): x is Note => Array.isArray(x))
    .map(([m, at, hold, vel], i): Note => [m, at + jitter(i), hold, vel]);
  const raws = sends
    .filter((x): x is Raw => !Array.isArray(x))
    .map((r, i) => ((r.bytes[0] & 0xf0) === 0x90 ? { ...r, at: r.at + jitter(i) } : r));
  await page.evaluate(
    ({ notes, raws, port }) => {
      const w = window as any;
      const midi = w.__midi;
      w.__capT ??= [];
      for (const r of raws)
        w.__capT.push(
          setTimeout(
            () => midi.send(port, r.bytes, r.at),
            Math.max(0, r.at - 60 - performance.now()),
          ),
        );
      for (const [m, at, hold, vel] of notes) {
        w.__capT.push(
          setTimeout(
            () => midi.send(port, [0x90, m, vel ?? 90], at),
            Math.max(0, at - 60 - performance.now()),
          ),
          setTimeout(
            () => midi.send(port, [0x80, m, 0], at + (hold ?? 150)),
            Math.max(0, at + (hold ?? 150) - 30 - performance.now()),
          ),
        );
      }
    },
    { notes, raws, port },
  );
}

export type Step = { at: number; notes: number[]; hold?: number; cc?: [number, number] };

/**
 * For drills whose clock comes from the shell's count-in: arm a schedule that starts the
 * moment the status says "Go." (the downbeat), then press Start. Resolves when armed;
 * the returned promise resolves once every note has been played.
 */
export async function startOnGo(page: Page, steps: Step[], port = KEYS) {
  await clearSends(page);
  steps = steps.map((s, i) => ({ ...s, at: s.at + jitter(i) }));
  await page.evaluate(
    ({ steps, port }) => {
      const w = window as any;
      w.__capDone = new Promise<void>((resolve) => {
        const midi = w.__midi;
        const run = () => {
          const t0 = performance.now();
          w.__capGo = t0;
          w.__capT ??= [];
          const setTimeout = (f: () => void, ms: number) => {
            const id = window.setTimeout(f, ms);
            w.__capT.push(id);
            return id;
          };
          let left = steps.length;
          if (!left) resolve();
          for (const s of steps) {
            setTimeout(
              () => {
                if (s.cc) midi.send(port, [0xb0, s.cc[0], s.cc[1]], t0 + s.at);
                for (const n of s.notes) midi.send(port, [0x90, n, 96], t0 + s.at);
              },
              Math.max(0, s.at - 60),
            );
            setTimeout(
              () => {
                for (const n of s.notes) midi.send(port, [0x80, n, 0]);
                if (--left === 0) resolve();
              },
              s.at + (s.hold ?? 150),
            );
          }
        };
        const status = document.querySelector('[role="status"]')!;
        const obs = new MutationObserver(() => {
          if (status.textContent?.trim() === "Go.") {
            obs.disconnect();
            run();
          }
        });
        obs.observe(status, { childList: true, characterData: true, subtree: true });
      });
    },
    { steps, port },
  );
  await startButton(page).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__capGo ?? 0), { timeout: 15_000 })
    .toBeGreaterThan(0);
  return page.evaluate(() => (window as any).__capGo as number);
}

/** Wait for the notes armed by `startOnGo` to have all been played. */
export async function goDone(page: Page) {
  await page.evaluate(() => (window as any).__capDone);
}

/** Clear the Go marker before the next armed run. */
export async function resetGo(page: Page) {
  await page.evaluate(() => {
    (window as any).__capGo = 0;
  });
}

/** Play `steps` now (relative ms), stamped. */
export async function playNow(page: Page, steps: Step[], port = KEYS) {
  await page.evaluate(
    ({ steps, port }) =>
      new Promise<void>((resolve) => {
        const midi = (window as any).__midi;
        const t0 = performance.now();
        let left = steps.length;
        for (const s of steps) {
          setTimeout(
            () => {
              for (const n of s.notes) midi.send(port, [0x90, n, 96], t0 + s.at);
            },
            Math.max(0, s.at - 60),
          );
          setTimeout(
            () => {
              for (const n of s.notes) midi.send(port, [0x80, n, 0]);
              if (--left === 0) resolve();
            },
            s.at + (s.hold ?? 150),
          );
        }
      }),
    { steps, port },
  );
}

/** One fret button on a drawn neck. */
export const fret = (s: number, f: number) => `button[aria-label^="String ${s} fret ${f},"]`;

/** Taps on fret buttons at absolute page times. */
export async function tapFretsAt(page: Page, taps: [string: number, fret: number, at: number][]) {
  taps = taps.map(([s, f, at], i) => [s, f, at + jitter(i)]);
  await page.evaluate((taps) => {
    for (const [s, f, at] of taps) {
      const el = () => document.querySelector(`button[aria-label^="String ${s} fret ${f},"]`);
      const o = { bubbles: true, pointerId: 9, button: 0 };
      setTimeout(
        () => el()?.dispatchEvent(new PointerEvent("pointerdown", o)),
        Math.max(0, at - performance.now()),
      );
      setTimeout(
        () => el()?.dispatchEvent(new PointerEvent("pointerup", o)),
        Math.max(0, at + 80 - performance.now()),
      );
    }
  }, taps);
}

/** A chord's worth of fret taps in one burst. */
export async function tapChord(page: Page, frets: [number, number][]) {
  await page.evaluate(async (frets) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (const [s, f] of frets) {
      const el = document.querySelector(`button[aria-label^="String ${s} fret ${f},"]`);
      const o = { bubbles: true, pointerId: 9, button: 0 };
      el?.dispatchEvent(new PointerEvent("pointerdown", o));
      await sleep(40);
      el?.dispatchEvent(new PointerEvent("pointerup", o));
      await sleep(20);
    }
  }, frets);
}

/** Scroll an element into the middle of the viewport (for phone shots of a long page). */
export async function centre(page: Page, selector: string) {
  await page.evaluate((sel) => {
    document.querySelector(sel)?.scrollIntoView({ block: "center", behavior: "instant" });
  }, selector);
  await page.waitForTimeout(150);
}

/** Back to the top of the page. */
export async function top(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
}

/** A wrong note struck again and again over `ms` from `at`, so its red mark stays up for a shot. */
export function wrongBurst(midi: number, at: number, ms = 1300, every = 140): Step[] {
  return Array.from({ length: Math.ceil(ms / every) }, (_, i) => ({
    at: at + i * every,
    notes: [midi],
    hold: every - 30,
  }));
}

/** Lesson state: the intro lesson on a first visit, or the concept card on a first Check. */
export async function captureLesson(page: Page, F: string, url: string, width: Width) {
  await lessons(page, true);
  await open(page, url);
  let found = await lessonView(page).isVisible();
  const check = page.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Check" });
  if (!found && (await check.count())) {
    // A plain click: `mode` would close the concept card this is here to shoot.
    await check.click();
    found = await lessonView(page)
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);
  }
  if (found) {
    await page.waitForTimeout(300);
    await shot(page, F, "lesson", width);
    await skipLesson(page);
  }
  await lessons(page, false);
  return found;
}

/** Hear it first, shot after `ms` of the demo. */
export async function captureDemo(page: Page, F: string, width: Width, ms = 2500) {
  const demo = page.getByRole("button", { name: /^Hear it( first)?$/ });
  if (!(await demo.count())) return false;
  await demo.click();
  await expect(page.getByText(/^(Listening|Demo playing), not scored\.$/)).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForTimeout(ms);
  await shot(page, F, "demo", width);
  // A short demo can end on its own.
  const stop = page.getByRole("button", { name: "Stop demo" });
  if (await stop.isVisible()) await stop.click({ timeout: 1000 }).catch(() => {});
  await page.waitForTimeout(300);
  return true;
}

/** The next-run button: in the results card through round 2, in the shell's dock bar from round 3. */
export const nextRunButton = (page: Page) =>
  page
    .getByTestId("next-run")
    .getByRole("button")
    .or(
      page
        .getByTestId("drill-bar")
        .getByRole("button", { name: /^(Speed up to|Slow (down )?to|Move on:|Step back:)/ }),
    )
    .first();

export interface GoFlow {
  F: string;
  url: string;
  width: Width;
  /** The correct run, from the downbeat. */
  steps: Step[];
  /** The running shot: a wrong note burst at this time (ms from the downbeat), shot inside it. */
  /** Two times: the light shot in the first burst, the dark one in the second. */
  wrong?: { midi: number; at: number | [number, number]; ms?: number };
  /** When there is no wrong burst: the running shot this long after the downbeat. */
  runningAt?: number;
  /** A weak run. */
  poor?: Step[];
  /** Check mode mid-run: shot this long after the downbeat. */
  checkAt?: number;
  /** Clean runs to try for the next-run button (default 2). */
  cleanRuns?: number;
  demo?: boolean;
  port?: string;
  /** Before every Start (e.g. pick an exercise). */
  before?: () => Promise<void>;
}

/**
 * The running shot at `at` (page times): one time shoots both themes, two times shoot
 * light at the first and dark at the second (each inside its own wrong-note burst).
 */
export async function runningShots(
  page: Page,
  F: string,
  width: Width,
  base: number,
  at: number[],
  state = "running",
) {
  if (width !== "phone") await top(page);
  if (at.length === 1) {
    await waitPerf(page, base + at[0]);
    await shot(page, F, state, width);
    return;
  }
  await waitPerf(page, base + at[0]);
  await shot(page, F, state, width, { themes: ["light"] });
  await waitPerf(page, base + at[1]);
  await shot(page, F, state, width, { themes: ["dark"] });
}

/** Every state of a drill whose clock starts on the shell's count-in "Go.". */
export async function goFlow(page: Page, o: GoFlow) {
  const { F, url, width } = o;
  const port = o.port ?? KEYS;
  await open(page, url);
  await shot(page, F, "ready", width);
  await captureLesson(page, F, url, width);
  await open(page, url);
  await mode(page, "Practice");
  if (o.demo !== false) await captureDemo(page, F, width);

  // Run A: correct, with a slip whose red mark is shot mid-run.
  await resetGo(page);
  const ats = o.wrong ? (Array.isArray(o.wrong.at) ? o.wrong.at : [o.wrong.at]) : [];
  const steps = [
    ...o.steps,
    ...ats.flatMap((at) =>
      wrongBurst(o.wrong!.midi, at, o.wrong!.ms ?? (ats.length > 1 ? 600 : 1300)),
    ),
  ].sort((a, b) => a.at - b.at);
  const go = await startOnGo(page, steps, port);
  await runningShots(
    page,
    F,
    width,
    go,
    ats.length ? ats.map((a) => a + 160) : [o.runningAt ?? 2500],
  );
  await goDone(page);
  await waitResults(page);
  await shot(page, F, "results-slip", width);

  // Clean runs until the next-run button offers to move on.
  for (let i = 0; i < (o.cleanRuns ?? 2); i++) {
    await resetGo(page);
    await startOnGo(page, o.steps, port);
    await goDone(page);
    await waitResults(page);
    if (await nextRunButton(page).isVisible()) break;
  }
  await shot(page, F, "results", width);

  if (o.poor) {
    await resetGo(page);
    await startOnGo(page, o.poor, port);
    await goDone(page);
    await waitResults(page);
    await shot(page, F, "results-poor", width);
  }

  if (o.checkAt !== undefined && (await hasCheck(page))) {
    await mode(page, "Check");
    await skipLesson(page);
    await resetGo(page);
    const g = await startOnGo(page, o.steps, port);
    await runningShots(page, F, width, g, [o.checkAt], "check");
    await goDone(page);
    await waitResults(page);
    await mode(page, "Practice");
  }

  // Nothing played.
  await startButton(page).click();
  await waitSilent(page, 90_000);
  await shot(page, F, "silent", width);
}

/**
 * A microphone that strums chords: sine tones at the chord's pitches with a plucked
 * envelope. `window.__chordMic.strum([midi...])` sounds one strum.
 */
export async function installChordMic(page: Page) {
  await page.addInitScript(() => {
    let ctx: AudioContext | null = null;
    let master: GainNode | null = null;
    const oscs: { o: OscillatorNode; g: GainNode }[] = [];
    (window as any).__chordMic = {
      strum(midis: number[]) {
        if (!ctx || !master) return;
        const t = ctx.currentTime;
        oscs.forEach(({ o, g }, i) => {
          const m = midis[i];
          if (m !== undefined) o.frequency.setValueAtTime(440 * 2 ** ((m - 69) / 12), t);
          g.gain.setValueAtTime(m === undefined ? 0 : 1 / midis.length, t);
        });
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(0.0001, t);
        master.gain.linearRampToValueAtTime(0.6, t + 0.006);
        master.gain.exponentialRampToValueAtTime(0.05, t + 1.1);
      },
    };
    navigator.mediaDevices.getUserMedia = async () => {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.0001;
      const dest = ctx.createMediaStreamDestination();
      master.connect(dest);
      for (let i = 0; i < 6; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        g.gain.value = 0;
        o.connect(g).connect(master);
        o.start();
        oscs.push({ o, g });
      }
      return dest.stream;
    };
  });
}

/** Turn the microphone on from the drill's own panel. */
export async function startMic(page: Page) {
  await page
    .getByRole("button", { name: /^(Start microphone|Turn on the microphone)$/ })
    .first()
    .click();
  await expect(page.getByText("Microphone on").first()).toBeVisible({ timeout: 10_000 });
}

export type Attrs = Record<string, string>;

/**
 * Press Start on a stage that exposes its run as data attributes (data-downbeat and
 * friends), wait for this run's downbeat, then play what `build` returns from them.
 */
export async function attrRun(
  page: Page,
  testId: string,
  build: (a: Attrs, downbeat: number) => Send[],
  port = KEYS,
) {
  await clearSends(page);
  const stage = page.getByTestId(testId).first();
  const prev = (await stage.getAttribute("data-downbeat").catch(() => null)) ?? "";
  await startButton(page).click();
  await expect
    .poll(
      async () => {
        const d = await stage.getAttribute("data-downbeat");
        return d && d !== prev ? Number(d) : 0;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  const a: Attrs = await stage.evaluate((el) =>
    Object.fromEntries([...el.attributes].map((x) => [x.name, x.value])),
  );
  const downbeat = Number(a["data-downbeat"]);
  await sendAt(page, port, build(a, downbeat));
  return { a, downbeat };
}

/** Shared shape for the stages that expose their run as data attributes. */
export interface AttrFlow {
  F: string;
  url: string;
  width: Width;
  testId: string;
  /** The notes of a correct run, from the stage's attributes. */
  build: (a: Attrs, downbeat: number) => Send[];
  /** Spoil a run: keep only some of the notes. */
  poor: (n: Send[]) => Send[];
  /** The running shot, ms after the downbeat. */
  runningAt: (a: Attrs) => number;
  /** A wrong note added to the first run at these ms after the downbeat. */
  wrong?: { midi: number; at: (a: Attrs) => [number, number] };
  check?: boolean;
  demo?: boolean;
  port?: string;
  /** Wait before Start (a stage still loading its sounds). */
  ready?: () => Promise<void>;
  after?: () => Promise<void>;
}

export const burst = (midi: number, at: number): Note[] =>
  Array.from({ length: 4 }, (_, i) => [midi, at + i * 140, 100] as Note);

export async function attrFlow(page: Page, o: AttrFlow) {
  const { F, url, width } = o;
  await open(page, url);
  await shot(page, F, "ready", width);
  await captureLesson(page, F, url, width);
  await open(page, url);
  await mode(page, "Practice");
  await o.ready?.();
  if (o.demo !== false) await captureDemo(page, F, width);

  let shotsAt: number[] = [];
  const r = await attrRun(
    page,
    o.testId,
    (a, d) => {
      const notes = o.build(a, d);
      shotsAt = o.wrong ? o.wrong.at(a).map((x) => x + 160) : [o.runningAt(a)];
      return o.wrong
        ? [...notes, ...o.wrong.at(a).flatMap((x) => burst(o.wrong!.midi, d + x))]
        : notes;
    },
    o.port,
  );
  await runningShots(page, F, width, r.downbeat, shotsAt);
  await waitResults(page, 90_000);
  await shot(page, F, o.wrong ? "results-slip" : "results", width);

  for (let i = 0; i < 2; i++) {
    await attrRun(page, o.testId, o.build, o.port);
    await waitResults(page, 90_000);
    if (await nextRunButton(page).isVisible()) break;
  }
  await shot(page, F, "results", width);

  await attrRun(page, o.testId, (a, d) => o.poor(o.build(a, d)), o.port);
  await waitResults(page, 90_000);
  await shot(page, F, "results-poor", width);

  if (o.check && (await hasCheck(page))) {
    await mode(page, "Check");
    await page
      .getByRole("button", { name: "Skip, I know this" })
      .click({ timeout: 1500 })
      .catch(() => {});
    const c = await attrRun(page, o.testId, o.build, o.port);
    await runningShots(page, F, width, c.downbeat, [o.runningAt(c.a)], "check");
    await waitResults(page, 90_000);
    await mode(page, "Practice");
  }

  await attrRun(page, o.testId, () => [], o.port);
  await waitSilent(page, 90_000);
  await shot(page, F, "silent", width);
  await o.after?.();
}

export const keep = (every: number) => (n: Send[]) => n.filter((_, i) => i % every === 0);

/**
 * Cancel notes still scheduled from the last run: a run that ends early (a slip ends a
 * phrase) must not leave its tail to play into the next one.
 */
export async function clearSends(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    for (const t of w.__capT ?? []) clearTimeout(t);
    w.__capT = [];
  });
}
