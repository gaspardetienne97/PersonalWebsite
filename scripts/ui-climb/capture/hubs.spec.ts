// Hub and tool captures: Today (fresh and with history), Drills, the command palette,
// Paths, Progress, Journal, Connect, Tuner, Settings, Guide, Library, Song Studio,
// Create and Record. History is made honestly: real runs in the same context (fake
// MIDI taps and clicked answers), never seeded sessions.
import { expect, test, type Page } from "@playwright/test";
import { choose, installSyntheticMic } from "../../../e2e/music/fixtures";
import { open, shot, type Width } from "./lib";
import {
  answerEar,
  earContinue,
  earQuestion,
  hz,
  installFakeMidi,
  midiNote,
  openWithMidi,
  pickMode,
  armTaps,
  PORTS,
  setup,
  startBtn,
  toResults,
  toTop,
  WIDTHS,
} from "./hub-drills";

const ODE = "e2e/music/fixtures/ode-to-joy.musicxml";
const ODE_NOTES = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62];

/** One Check run of ten clicked answers, `wrong` the question numbers missed. */
async function earRun(page: Page, wrong: number[] = []) {
  await pickMode(page, "Check");
  await startBtn(page).click();
  const card = page.locator("article[data-drill]");
  for (let i = 1; i <= 10; i++) {
    await earQuestion(page, i);
    await answerEar(page, !wrong.includes(i));
    if (i === 10) break;
    // Check moves on by itself; if feedback lingers, Continue does it.
    await expect(async () => {
      if ((await card.getAttribute("data-step", { timeout: 1000 })) === "feedback")
        await earContinue(page);
      await expect(card).toHaveAttribute("aria-label", `Question ${i + 1}`, { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
  }
  await toResults(page);
}

/** A pulse run from the open rhythm page: every beat tapped (Space; Voice ignores MIDI), one late. */
async function pulseRun(page: Page) {
  const beats = Number(
    /(\d+) beats/.exec(await page.getByTestId("setup-line").innerText())?.[1] ?? 4,
  );
  await armTaps(
    page,
    Array.from({ length: beats }, (_, i) => i),
    { via: "space", off: { 2: 70 } },
  );
  await startBtn(page).click();
  await toResults(page);
  await expect(page.getByText("Nothing was heard", { exact: false })).toHaveCount(0);
}

/**
 * Practice history: today's set on Voice (10 min: a pulse warm-up and scale degrees),
 * done block by block from Today, plus an intervals check. `afterFirst` runs on Today
 * once the first block is done, `onDone` the moment the finished set is first seen.
 */
/** Today block `n` (1-based): its row opens to its details, where its Start link sits. */
async function startBlock(page: Page, n: number) {
  const row = page.locator(`button[aria-controls="block-${n}"]`);
  const start = page.locator(`#block-${n}`).getByRole("link", { name: /^(Start|Play again)/ });
  await expect(async () => {
    if ((await row.getAttribute("aria-expanded", { timeout: 2000 })) !== "true") await row.click();
    await expect(start).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await start.click();
}

async function makeHistory(
  page: Page,
  hooks: { afterFirst?: () => Promise<void>; onDone?: () => Promise<void> } = {},
) {
  await openWithMidi(page, "/music", { countInBars: 1 });
  // Length and routine sit behind "Adjust" (a toggle: open it once, never click it shut).
  const adjust = page.getByRole("button", { name: "Adjust" });
  const ten = page
    .getByRole("group", { name: "Length of the set" })
    .getByRole("button", { name: "10 min", exact: true });
  await expect(async () => {
    if ((await adjust.getAttribute("aria-expanded", { timeout: 2000 })) !== "true")
      await adjust.click();
    await expect(ten).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await ten.click();
  await expect(ten).toHaveAttribute("aria-pressed", "true");
  await choose(page, page.getByLabel(/^Instrument on \w+s$/), "Voice");
  await expect(page.getByText(/session, Voice$/)).toBeVisible();
  await expect(page.locator('button[aria-controls^="block-"]')).toHaveCount(2);

  // Block 1: the warm-up.
  await startBlock(page, 1);
  await expect(page).toHaveURL(/\/music\/rhythm/);
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(500);
  await pulseRun(page);
  await open(page, "/music");
  await hooks.afterFirst?.();

  // An intervals check on the side.
  await open(
    page,
    "/music/ear/intervals?answer=choice&intervals=m3,M3,P4,P5,P8&direction=ascending",
  );
  await earRun(page, [4, 9]);

  // Block 2: scale degrees, which finishes the set.
  await open(page, "/music");
  await startBlock(page, 2);
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(500);
  await earRun(page, [6]);
  await page.goto("/music");
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 60_000 });
  await hooks.onDone?.();
}

test.describe.configure({ mode: "parallel" });

for (const width of WIDTHS) {
  test(`today-fresh ${width}`, async ({ page }) => {
    await setup(page, width);
    await open(page, "/music");
    await shot(page, "today-fresh", "home", width, { full: true });
  });

  test(`history: today, progress, journal ${width}`, async ({ page }) => {
    test.setTimeout(300_000);
    await setup(page, width);
    await makeHistory(page, {
      afterFirst: async () => {
        await page.waitForTimeout(500);
        await shot(page, "today-history", "home", width, { full: true });
      },
      onDone: async () => {
        // The once-a-day burst plays for about a second; shoot it mid-flight, then at rest.
        // The sessions load after the page: wait for the finished set before looking for the burst.
        await page.locator(".celebrate").waitFor({ timeout: 20_000 });
        const burst = page.locator(".celebrate.fresh");
        if (await burst.count()) {
          await page.waitForTimeout(300);
          await shot(page, "today-history", "celebration", width);
        } else console.log("today-history: no celebration");
        await page.waitForTimeout(1500);
        await toTop(page);
        await shot(page, "today-history", "done", width, { full: true });
      },
    });

    for (const [state, url] of [
      ["what-next", "/music/progress"],
      ["skills", "/music/progress?view=skills"],
      ["sessions", "/music/progress?view=sessions"],
    ] as const) {
      await open(page, url);
      await page.waitForTimeout(500);
      await shot(page, "progress", state, width, { full: true });
    }

    await open(page, "/music/journal");
    await page.waitForTimeout(500);
    await shot(page, "journal", "list", width, { full: true });
    // One session opened, then its note and tags in the edit view.
    const entry = page.locator("article[data-session]").first();
    // Retry until it opens: a click that lands before the page hydrates does nothing.
    const answers = entry.getByRole("button", { name: /every answer|Hide answers/ }).first();
    await expect(async () => {
      if ((await answers.getAttribute("aria-expanded", { timeout: 2000 })) !== "true")
        await answers.click();
      await expect(answers).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    await page.waitForTimeout(400);
    await entry.scrollIntoViewIfNeeded();
    await shot(page, "journal", "entry", width);
    await entry.getByRole("button", { name: /^Edit note/ }).click();
    const note = entry.getByRole("textbox").first();
    await note.fill("Pulse rushed on beat 3. Degrees felt solid, 6 still slips.");
    await page.waitForTimeout(300);
    await entry.scrollIntoViewIfNeeded();
    await shot(page, "journal", "edit", width);
  });

  test(`progress and journal empty ${width}`, async ({ page }) => {
    await setup(page, width);
    await open(page, "/music/progress");
    await shot(page, "progress", "empty", width, { full: true });
    await open(page, "/music/journal");
    await shot(page, "journal", "empty", width, { full: true });
  });

  test(`drills-tab ${width}`, async ({ page }) => {
    await setup(page, width);
    await open(page, "/music?tab=drills");
    await shot(page, "drills-tab", "list", width, { full: true });
    // The chip row, or (once it is gone, round 2 WP3) the strip's instrument the list follows.
    const chips = page.getByRole("group", { name: "Show drills for" });
    if (await chips.count()) await chips.getByRole("button", { name: "Guitar" }).click();
    else
      await choose(
        page,
        page.getByRole("group", { name: "Practice controls" }).getByLabel("Instrument"),
        "Guitar",
      );
    await page.waitForTimeout(500);
    await shot(page, "drills-tab", "filtered", width, { full: true });
  });

  test(`palette ${width}`, async ({ page }) => {
    await setup(page, width);
    await open(page, "/music");
    const search = page.getByRole("button", { name: "Search" });
    if (await search.isVisible().catch(() => false)) await search.click();
    else await page.keyboard.press("Control+k");
    const input = page.getByRole("dialog").getByRole("textbox", { name: "Search" });
    await expect(input).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, "palette", "open", width);
    await input.pressSequentially("interv", { delay: 40 });
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    await shot(page, "palette", "typed", width);
  });

  test(`paths ${width}`, async ({ page }) => {
    await setup(page, width);
    await open(page, "/music?tab=paths");
    await shot(page, "paths", "list", width, { full: true });
    // Another path, one of its steps opened.
    await page.getByRole("button", { name: /^Ear and Harmony Path/ }).click();
    await page.waitForTimeout(400);
    const step = page
      .getByRole("button", { name: /^Step \S+: .*(Not started|not played yet)/ })
      .first();
    await step.click();
    await page.waitForTimeout(400);
    await step.scrollIntoViewIfNeeded();
    await shot(page, "paths", "detail", width);
  });

  test(`connect ${width}`, async ({ page }) => {
    await setup(page, width);
    // Nothing connected, MIDI not yet on.
    await open(page, "/music/connect");
    await shot(page, "connect", "empty", width, { full: true });
  });

  test(`connect rig ${width}`, async ({ page }) => {
    await setup(page, width);
    await installFakeMidi(page, [PORTS.keys, PORTS.mpcPrivate, PORTS.aerophone]);
    await installSyntheticMic(page, 220);
    await open(page, "/music/connect");
    await page.getByRole("button", { name: "Enable MIDI" }).click();
    await expect(page.getByTestId(`device-${PORTS.mpcPrivate.id}`)).toBeVisible();
    await choose(
      page,
      page
        .getByTestId(`device-${PORTS.mpcPrivate.id}`)
        .getByLabel("Pad notes (what your drum program sends)"),
      /^Akai/,
    );
    // Something played on each device, so the live tiles show their last note.
    for (const m of [60, 64, 67]) await midiNote(page, PORTS.keys.id, m, 90, 1, 120);
    await midiNote(page, PORTS.mpcPrivate.id, 37, 110, 10);
    await midiNote(page, PORTS.aerophone.id, 67, 80, 1, 200);
    await page.waitForTimeout(400);
    await toTop(page);
    await shot(page, "connect", "rig", width, { full: true });
    // Device setup: the guided Learn pads capture on the MPC.
    const mpc = page.getByTestId(`device-${PORTS.mpcPrivate.id}`);
    await mpc.getByRole("button", { name: "Learn pads" }).click();
    for (const n of [37, 36, 42]) await midiNote(page, PORTS.mpcPrivate.id, n, 100, 10);
    await page.waitForTimeout(400);
    await mpc.scrollIntoViewIfNeeded();
    await shot(page, "connect", "learn-pads", width);
  });

  test(`tuner ${width}`, async ({ page }) => {
    await setup(page, width);
    // A2, about 18 cents sharp.
    await installSyntheticMic(page, hz(45.18));
    await open(page, "/music/tuner");
    await page.getByRole("button", { name: "Start listening" }).click();
    await expect(page.getByTestId("tuner-note")).toHaveText("A2", { timeout: 15_000 });
    await page.waitForTimeout(1200);
    await shot(page, "tuner", "listening", width, { full: true });
    await page.getByRole("link", { name: "Intonation" }).click();
    await expect(page.getByTestId("intonation-stats")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(2500);
    await shot(page, "tuner", "intonation", width, { full: true });
    await page.getByRole("link", { name: "Drone" }).click();
    await page.getByRole("button", { name: "Play drone" }).click();
    await expect(page.getByRole("button", { name: "Stop drone" })).toBeVisible();
    await page.waitForTimeout(800);
    await shot(page, "tuner", "drone", width, { full: true });
    await page.getByRole("button", { name: "Stop drone" }).click();
  });

  test(`settings and guide ${width}`, async ({ page }) => {
    await setup(page, width);
    await open(page, "/music/settings");
    await shot(page, "settings", "page", width, { full: true });
    await open(page, "/music/guide");
    await shot(page, "guide", "page", width, { full: true });
  });

  test(`library ${width}`, async ({ page }) => {
    await setup(page, width);
    await open(page, "/music/library");
    await shot(page, "library", "shelf", width, { full: true });
    await open(page, "/music/library?tab=reference");
    await shot(page, "library", "reference", width, { full: true });
    await open(page, "/music/library?tab=import");
    await shot(page, "library", "import", width, { full: true });
    // A score picked: the preview before saving.
    await page.getByLabel("Score file").setInputFiles(ODE);
    await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, "library", "import-preview", width, { full: true });
  });

  test(`song-studio ${width}`, async ({ page }) => {
    test.setTimeout(180_000);
    await setup(page, width);
    await openWithMidi(page, "/music/library?tab=import");
    await page.getByLabel("Score file").setInputFiles(ODE);
    await page.getByRole("button", { name: "Save to songs" }).click();
    await expect(page.getByText("Ode to Joy is in your songs.")).toBeVisible();
    await open(page, "/music/library");
    await shot(page, "library", "shelf-with-song", width, { full: true });
    await page
      .getByRole("link", { name: /Ode to Joy/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Ode to Joy" })).toBeVisible({
      timeout: 30_000,
    });
    await page.goto(page.url().split("?")[0] + "?mode=wait");
    await expect(page.getByRole("heading", { level: 1, name: "Ode to Joy" })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(800);
    await shot(page, "song-studio", "ready", width, { full: true });

    await page.getByRole("button", { name: "Start in wait mode" }).click();
    await expect(page.getByRole("status")).toContainText("Wait mode");
    // The first six notes, then a slip, shot while it flashes.
    for (const m of ODE_NOTES.slice(0, 6)) await midiNote(page, PORTS.keys.id, m, 96, 1, 90);
    await midiNote(page, PORTS.keys.id, 66, 96, 1, 60);
    await page.waitForTimeout(80);
    await shot(page, "song-studio", "running", width);
    for (const m of ODE_NOTES.slice(6)) await midiNote(page, PORTS.keys.id, m, 96, 1, 90);
    await expect(page.getByRole("heading", { name: "Results" })).toBeAttached({ timeout: 15_000 });
    await page.waitForTimeout(900);
    await toTop(page);
    await shot(page, "song-studio", "results", width, { full: true });
  });

  test(`create ${width}`, async ({ page }) => {
    await setup(page, width);
    await open(page, "/music/create");
    // The starter beat is there; add a few hits so it is someone's groove.
    const beat = page.getByRole("region", { name: "Beat editor" });
    for (const name of ["Kick, bar 1 step 11", "Snare, bar 1 step 16", "Hats, bar 1 step 4"]) {
      const cell = beat.getByRole("button", { name, exact: true });
      if ((await cell.count()) && (await cell.getAttribute("aria-pressed")) === "false")
        await cell.click();
    }
    await page.waitForTimeout(300);
    await toTop(page);
    await shot(page, "create", "beat-grid", width, { full: true });
    // The same beat playing on its own: the playhead column lit as it goes.
    await beat.getByRole("button", { name: /^Play (groove|beat)$/ }).click();
    await expect(beat.locator("[data-now]").first()).toBeAttached({ timeout: 10_000 });
    await page.waitForTimeout(1200);
    await shot(page, "create", "playing", width);
    await beat.getByRole("button", { name: "Stop", exact: true }).click();
    await open(page, "/music/create?mode=roll");
    await shot(page, "create", "roll", width, { full: true });
    await open(page, "/music/create/kits");
    await shot(page, "create", "kits", width, { full: true });
  });

  test(`record ${width}`, async ({ page }) => {
    await setup(page, width);
    await installSyntheticMic(page, 220);
    await open(page, "/music/record?source=mic");
    await shot(page, "record", "ready", width, { full: true });
    await page.getByRole("button", { name: "Arm microphone" }).click();
    await expect(page.getByTestId("level-advice")).toContainText(
      /Good level|A little hot|Clipping|Quiet/,
      {
        timeout: 15_000,
      },
    );
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await page.waitForTimeout(1800);
    await shot(page, "record", "recording", width, { full: true });
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Saved Audio take 1");
    await page.waitForTimeout(500);
    await shot(page, "record", "take", width, { full: true });
  });
}
