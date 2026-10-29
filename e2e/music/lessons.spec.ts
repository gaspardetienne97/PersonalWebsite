// Intro lessons in the drill frame (lessons are on here; the other suites switch them off).
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

const URL = "/music/circle?mode=order";
const lessonHeading = (page: Page) => page.getByRole("heading", { name: "The order of sharps" });
const start = (page: Page) => page.getByRole("button", { name: "Start", exact: true });

/** Records whether the lesson ever appears, so a flash before the stored settings arrive is caught. */
async function watchForLesson(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __lessonFlashed: boolean }).__lessonFlashed = false;
    // Stored settings arrive late (IndexedDB success events delayed), the case a flash needs.
    const add = IDBRequest.prototype.addEventListener;
    IDBRequest.prototype.addEventListener = function (
      this: IDBRequest,
      type: string,
      fn: never,
      ...rest: never[]
    ) {
      if (type !== "success") return add.call(this, type, fn, ...rest);
      return add.call(
        this,
        type,
        ((e: Event) => setTimeout(() => (fn as (e: Event) => void)(e), 400)) as never,
        ...rest,
      );
    } as typeof add;
    const desc = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "onsuccess")!;
    Object.defineProperty(IDBRequest.prototype, "onsuccess", {
      set(fn) {
        desc.set!.call(this, fn && ((e: Event) => setTimeout(() => fn.call(this, e), 400)));
      },
      get: desc.get,
    });
    new MutationObserver(() => {
      if (document.querySelector("[data-testid=lesson]"))
        (window as unknown as { __lessonFlashed: boolean }).__lessonFlashed = true;
    }).observe(document, { childList: true, subtree: true });
  });
}
const flashed = (page: Page) =>
  page.evaluate(() => (window as unknown as { __lessonFlashed: boolean }).__lessonFlashed);

/** Next until the last screen's "Start the quiz" shows. */
async function toEnd(page: Page) {
  const done = page.getByRole("button", { name: "Start the quiz" });
  for (let i = 0; i < 40 && !(await done.isVisible()); i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  return done;
}

test.describe("intro lessons", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("first visit shows the lesson, not the stage", async ({ page }) => {
    await page.goto(URL);
    await expect(lessonHeading(page)).toBeVisible();
    await expect(start(page)).toHaveCount(0);
  });

  test("Space does nothing on a lesson; arrows move", async ({ page }) => {
    await page.goto(URL);
    await expect(lessonHeading(page)).toBeVisible();
    await page.keyboard.press("Space");
    await expect(lessonHeading(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Stop/ })).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("Tap Next", { exact: false }).first()).toBeVisible();
    for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: "Flats run backwards" })).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(lessonHeading(page)).toBeVisible();
  });

  test("finishing lands in Practice and is remembered", async ({ page }) => {
    await page.goto(URL);
    await (await toEnd(page)).click();
    await expect(start(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Practice", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await watchForLesson(page);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(start(page)).toBeVisible();
    expect(await flashed(page), "the lesson flashed before settings loaded").toBe(false);
  });

  test("skip marks it seen", async ({ page }) => {
    await page.goto(URL);
    await page.getByRole("button", { name: "Skip, I know this" }).click();
    await expect(start(page)).toBeVisible();
    await watchForLesson(page);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(start(page)).toBeVisible();
    expect(await flashed(page), "the lesson flashed before settings loaded").toBe(false);
  });

  test("the Lesson button brings it back", async ({ page }) => {
    await page.goto(URL);
    await page.getByRole("button", { name: "Skip, I know this" }).click();
    await page.getByRole("button", { name: "Lesson", exact: true }).click();
    await expect(lessonHeading(page)).toBeVisible();
  });

  test("changing tab swaps the lesson", async ({ page }) => {
    await page.goto(URL);
    await expect(lessonHeading(page)).toBeVisible();
    await page.getByRole("button", { name: "Signatures", exact: true }).click();
    await expect(lessonHeading(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Round the wheel" })).toBeVisible();
  });

  test("signature shows count first, then signature", async ({ page }) => {
    await page.goto(URL);
    await page.getByRole("button", { name: "Read it", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Round the wheel" })).toBeVisible();
    const second = page.getByRole("heading", {
      name: "Sharps and flats on the staff",
    });
    for (let i = 0; i < 30 && !(await second.isVisible()); i++)
      await page.getByRole("button", { name: /^Next/ }).click();
    await expect(second).toBeVisible();
  });

  test("the Lesson button is a plain button, and ending a lesson puts focus on Start", async ({
    page,
  }) => {
    await page.goto(URL);
    await expect(lessonHeading(page)).toBeVisible();
    await page.getByRole("button", { name: "Skip, I know this" }).click();
    await expect(start(page)).toBeFocused();
    const lesson = page.getByRole("button", { name: "Lesson", exact: true });
    await expect(lesson).not.toHaveAttribute("aria-pressed");
    await lesson.click();
    await expect(lessonHeading(page)).toBeVisible();
    await (await toEnd(page)).click();
    await expect(start(page)).toBeFocused();
  });

  test("Lesson, then a tab with no lesson, shows the stage", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/music/rhythm?mode=groove");
    await page.getByRole("button", { name: "Skip, I know this" }).click();
    await page.getByRole("button", { name: "Lesson", exact: true }).click();
    await expect(page.getByTestId("lesson")).toBeVisible();
    await page.getByRole("button", { name: "Pulse", exact: true }).click();
    await expect(page.getByTestId("lesson")).toHaveCount(0);
    await expect(start(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("after a run: the Lesson button shows, and a new tab's lesson replaces the results", async ({
    page,
  }) => {
    await page.goto(URL);
    await page.getByRole("button", { name: "Skip, I know this" }).click();
    await start(page).click();
    const again = page.getByRole("button", { name: "Again", exact: true });
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("1");
      await page.keyboard.press("Enter");
    }
    await expect(again).toBeVisible();
    await expect(page.getByRole("button", { name: "Lesson", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Signatures", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Round the wheel" })).toBeVisible();
    await expect(again).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Results" })).toHaveCount(0);
    await page.getByRole("button", { name: "Skip, I know this" }).click();
    await expect(again).toBeVisible();
  });

  test("the progress row counts every screen of a chained lesson", async ({ page }) => {
    await page.goto("/music/ear/intervals?intervals=P5,P8");
    const lesson = page.getByTestId("lesson");
    await expect(lesson).toContainText("Screen 1 of 3");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(lesson).toContainText("Screen 2 of 3");
    await expect(lesson.getByRole("heading", { name: "Perfect 5th" })).toBeVisible();
  });

  test("screen 1 shows a staff before the first Next", async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId("lesson").locator("svg").first()).toBeVisible();
  });

  test("no overflow at 375", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(URL);
    await expect(lessonHeading(page)).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ArrowRight");
      await expectNoHorizontalOverflow(page);
    }
  });
});

test.describe("fretboard lessons", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
  });

  test("the note finder lesson shows a fretboard and fits at 375", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/music/fretboard?mode=note-finder");
    await expect(page.getByRole("heading", { name: "The open strings" })).toBeVisible();
    await expect(
      page.getByTestId("lesson").getByRole("group", { name: /fretboard/i }),
    ).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ArrowRight");
      await expectNoHorizontalOverflow(page);
    }
  });
});

test.describe("tier 1 lessons", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
  });

  const cases: [string, string, string][] = [
    ["jazz voicing types", "/music/voicings?variant=so-what", "So What"],
    ["groove dictation", "/music/rhythm?mode=groove", "The kick"],
    ["find home", "/music/by-ear?mode=home", "Home is one note"],
    ["call and response answer", "/music/call-response?mode=answer", "The chord's tones"],
    ["aerophone bite vibrato", "/music/aerophone?mode=vibrato", "Vibrato from the bite"],
    ["pads improvise", "/music/pads?mode=improvise", "Play over the band"],
    ["pads rudiments", "/music/pads", "Two hands, two pads"],
    [
      "pads grooves level 3",
      "/music/pads?mode=groove&groove=funk-sixteenths",
      "Counting sixteenths",
    ],
    ["flashcards", "/music/reading?activity=flashcards", "Five lines"],
    ["sight-reading", "/music/reading?activity=sight-reading", "Five lines"],
    ["rhythm echo", "/music/rhythm?mode=echo", "Counting the beat"],
    ["rhythm dictation", "/music/rhythm?mode=dictation", "Counting the beat"],
    ["mixing ear", "/music/listening", "Flat, then Changed"],
    ["aerophone long tone", "/music/aerophone?mode=long-tone", "One note, one even breath"],
    ["aerophone articulation", "/music/aerophone?mode=articulation", "One tongue a beat"],
    [
      "aerophone interval landing",
      "/music/aerophone?mode=interval-landing",
      "Land on the interval",
    ],
    ["aerophone register", "/music/aerophone?mode=register", "Across the break"],
    ["guitar bends", "/music/fretboard?mode=bends", "A whole step is two frets"],
    ["piano pedal", "/music/pedal", "Pedal after the chord"],
  ];
  for (const [name, url, heading] of cases) {
    test(`${name} shows its lesson on the first visit`, async ({ page }) => {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    });
  }

  test("pads rudiments: the intro, then the rudiment's own card, with the pads figure at 375", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/music/pads?pattern=flam");
    await expect(
      page.getByRole("heading", { name: "Two hands, two pads", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("lesson").getByRole("group", { name: /MPC pads/ })).toBeVisible();
    const flam = page.getByRole("heading", { name: "Flam", exact: true });
    for (let i = 0; i < 12 && !(await flam.isVisible()); i++) {
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expectNoHorizontalOverflow(page);
    }
    await expect(flam).toBeVisible();
    await expect(page.getByRole("button", { name: "Start the quiz" })).toBeVisible();
  });

  test("pads grooves below level 3 have no lesson", async ({ page }) => {
    await page.goto("/music/pads?mode=groove&groove=basic-rock");
    await expect(start(page)).toBeVisible();
    await expect(page.getByTestId("lesson")).toHaveCount(0);
  });

  test("long tone with a level adds the levels lesson, a palm crossing its own", async ({
    page,
  }) => {
    await page.goto("/music/aerophone?mode=long-tone&level=mf");
    await expect(
      page.getByRole("heading", {
        name: "One note, one even breath",
        exact: true,
      }),
    ).toBeVisible();
    const levels = page.getByRole("heading", {
      name: "Hold at a loudness",
      exact: true,
    });
    for (let i = 0; i < 6 && !(await levels.isVisible()); i++)
      await page.getByRole("button", { name: /^Next/ }).click();
    await expect(levels).toBeVisible();
    await page.goto("/music/aerophone?mode=register&pair=d6-f6");
    const palm = page.getByRole("heading", {
      name: "Reaching for the palm keys",
      exact: true,
    });
    for (let i = 0; i < 8 && !(await palm.isVisible()); i++)
      await page.getByRole("button", { name: /^Next/ }).click();
    await expect(palm).toBeVisible();
  });

  test("the bends and pedal lessons fit at 375", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const url of ["/music/fretboard?mode=bends", "/music/pedal"]) {
      await page.goto(url);
      await expect(page.getByTestId("lesson")).toBeVisible();
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("ArrowRight");
        await expectNoHorizontalOverflow(page);
      }
    }
  });

  test("drop-2 shows 4-way close first", async ({ page }) => {
    await page.goto("/music/voicings?variant=drop2");
    await expect(page.getByRole("heading", { name: "4-way close", exact: true })).toBeVisible();
    for (let i = 0; i < 2 + 5; i++) {
      await page.getByRole("button", { name: /^Next/ }).click();
      if (await page.getByRole("heading", { name: "Drop-2", exact: true }).isVisible()) break;
    }
    await expect(page.getByRole("heading", { name: "Drop-2", exact: true })).toBeVisible();
  });
});

test.describe("ear lessons", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
  });
  const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
  const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true }).click();

  test("intervals: the intro, then each interval; a bigger level teaches only the new one", async ({
    page,
  }) => {
    await page.goto("/music/ear/intervals?intervals=P5,P8");
    await expect(heading(page, "Distance in half steps")).toBeVisible();
    await next(page);
    await expect(heading(page, "Perfect 5th")).toBeVisible();
    await next(page);
    await expect(heading(page, "Octave")).toBeVisible();
    await (await toEnd(page)).click();
    await expect(start(page)).toBeVisible();

    await page.goto("/music/ear/intervals?intervals=P5,P8,M3");
    await expect(heading(page, "Major 3rd")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start the quiz" })).toBeVisible();
  });

  test("the lesson follows the level, not the answer mode", async ({ page }) => {
    await page.goto("/music/ear/chord-qualities?qualities=minor&answer=play-back");
    await expect(heading(page, "One chord, all notes together")).toBeVisible();
    await next(page);
    await expect(heading(page, "Minor")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start the quiz" })).toBeVisible();
  });

  test("the feel drill teaches each feel", async ({ page }) => {
    await page.goto("/music/ear/feel");
    await expect(heading(page, "How the beat is divided")).toBeVisible();
    await next(page);
    await expect(heading(page, "Straight")).toBeVisible();
  });

  test("an ear lesson fits at 375", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/music/ear/inversions?inversions=first");
    await expect(heading(page, "Which note is lowest")).toBeVisible();
    await next(page);
    await expect(heading(page, "First inversion")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("reading and rhythm lessons fit at 375", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const url of [
      "/music/reading?activity=flashcards",
      "/music/reading?activity=sight-reading",
      "/music/rhythm?mode=dictation",
    ]) {
      await page.goto(url);
      await expect(page.getByTestId("lesson")).toBeVisible();
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("ArrowRight");
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});

test.describe("jam game lessons", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
  });
  const check = (page: Page) => page.getByRole("button", { name: "Check", exact: true });

  test("Practice shows no lesson; Check shows the game's, and finishing stays in Check", async ({
    page,
  }) => {
    await page.goto("/music/jam?game=guide-tones&backing=none");
    await expect(page.getByRole("button", { name: /^Start jamming/ })).toBeVisible();
    await expect(page.getByTestId("lesson")).toHaveCount(0);
    await check(page).click();
    await expect(page.getByTestId("lesson")).toBeVisible();
    await expect(page.getByRole("heading", { name: "The notes that name a chord" })).toBeVisible();
    await (await toEnd(page)).click();
    await expect(page.getByTestId("lesson")).toHaveCount(0);
    await expect(page.locator("#mode-note")).toContainText("Tone roles hidden");
    await expect(page.getByRole("button", { name: /^Start jamming/ })).toBeVisible();
  });

  test("the open game has no lesson, and another game has its own", async ({ page }) => {
    await page.goto("/music/jam?game=free&backing=none");
    await check(page).click();
    await expect(page.getByRole("button", { name: /^Start jamming/ })).toBeVisible();
    await expect(page.getByTestId("lesson")).toHaveCount(0);
    await page.goto("/music/jam?game=approach&backing=none");
    await check(page).click();
    await expect(page.getByRole("heading", { name: "Lean in from a half step" })).toBeVisible();
  });

  test("a Jam lesson fits at 375", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const game of ["side-slip", "motif", "space"]) {
      await page.goto(`/music/jam?game=${game}&backing=none`);
      await check(page).click();
      await expect(page.getByTestId("lesson")).toBeVisible();
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("ArrowRight");
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});

test.describe("concept cards", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
  });
  const check = (page: Page) => page.getByRole("button", { name: "Check", exact: true });

  test("Scales shows no card in Practice, the formula card on first Check, and stays in Check", async ({
    page,
  }) => {
    await page.goto("/music/scales?instrument=piano");
    await expect(page.getByRole("button", { name: /^Start/ }).first()).toBeVisible();
    await expect(page.getByTestId("lesson")).toHaveCount(0);
    await check(page).click();
    await expect(page.getByTestId("lesson")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Whole steps and half steps" })).toBeVisible();
    await (await toEnd(page)).click();
    await expect(page.getByTestId("lesson")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Start/ }).first()).toBeVisible();
    await expect(check(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("Practice results, then Check, shows the Check card; finishing brings the results back", async ({
    page,
  }) => {
    await page.goto("/music/chords?mode=build");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("button", { name: "Finish now" }).click();
    const again = page.getByRole("button", { name: "Again", exact: true });
    await expect(again).toBeVisible();
    await expect(page.getByRole("button", { name: "Lesson", exact: true })).toBeVisible();
    await check(page).click();
    await expect(page.getByRole("heading", { name: "Shape the hand" })).toBeVisible();
    await expect(again).toHaveCount(0);
    await (await toEnd(page)).click();
    await expect(again).toBeVisible();
    await expect(check(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("a technique tip shows on first Check", async ({ page }) => {
    await page.goto("/music/two-hand");
    await expect(page.getByTestId("lesson")).toHaveCount(0);
    await check(page).click();
    await expect(page.getByRole("heading", { name: "One hand at a time" })).toBeVisible();
  });

  test("each tab gets the card for its own setup", async ({ page }) => {
    await page.goto("/music/voicings?variant=minor");
    await check(page).click();
    await expect(
      page.getByRole("heading", { name: "Half-diminished, altered, minor" }),
    ).toBeVisible();
    await page.goto("/music/voicings?variant=voice-leading");
    await check(page).click();
    await expect(page.getByRole("heading", { name: "The 3rd and the 7th" })).toBeVisible();
    await page.goto("/music/chord-scales?changes=minor");
    await check(page).click();
    await expect(page.getByTestId("lesson")).toContainText("Scales for a minor ii-V-i");
  });

  test("cards fit at 375", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const url of [
      "/music/scales?instrument=piano",
      "/music/voicings?variant=major",
      "/music/chord-scales",
    ]) {
      await page.goto(url);
      await check(page).click();
      await expect(page.getByTestId("lesson")).toBeVisible();
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("ArrowRight");
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});
