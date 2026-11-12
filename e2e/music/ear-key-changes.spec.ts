// Key changes in Progression dictation, and the circle drill's tune analysis:
// where a progression goes and the chords that take it there; a tune's changes
// marked with key centre and function, chord by chord.
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, pickMode } from "./fixtures";

test.describe.configure({ retries: 2 });
// Another agent's edit must not reload the page mid-run.
test.beforeEach(({ page }) => page.routeWebSocket(/\/\?token=|vite-hmr/, () => {}));

const LABEL: Record<string, string> = {
  "up-half": "Up a half step",
  "up-step": "Up a whole step",
  "up-min3": "Up a minor third",
  "down-min3": "Down a minor third",
  "down-maj3": "Down a major third",
  "up-4th": "Up a fourth",
  relative: "To the relative minor",
  parallel: "To the parallel minor",
};
const prompt = (page: Page) => page.locator("article[data-drill]");
const slots = (page: Page) =>
  page.getByRole("list", { name: "Your progression" }).getByRole("listitem");
const tap = (page: Page, t: string) =>
  page
    .locator("button.choice", {
      hasText: new RegExp(`^${(LABEL[t] ?? t.replace(/^b/, "♭")).replace(/[+]/g, "\\$&")}$`),
    })
    .click();

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

test("key changes: where it goes first, then the chords, judged slot by slot", async ({ page }) => {
  await page.goto("/music/ear/progressions?answer=choice&changes=key");
  await expect(
    page.getByRole("heading", { level: 1, name: "Progression dictation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const card = prompt(page);
  await expect(card).toHaveAttribute("data-drill", "key-change");
  const [dest, ...chords] = (await card.getAttribute("data-answer"))!.split(" ");
  await expect(slots(page)).toHaveCount(chords.length + 1);
  // The first slot takes a destination: the eight are the only buttons.
  await expect(page.locator("button.choice", { hasText: "To the relative minor" })).toBeVisible();
  await expect(page.locator("button.choice", { hasText: /^V7$/ })).toHaveCount(0);
  await tap(page, dest);
  await expect(slots(page).first()).toHaveText(LABEL[dest]);
  for (const c of chords.slice(0, -1)) await tap(page, c);
  const last = chords.at(-1)!;
  await tap(page, last === "Imaj7" ? "i7" : "Imaj7");
  await expect(card).toHaveAttribute("data-step", "feedback");
  await expect(slots(page).first()).toHaveAttribute("data-state", "right");
  await expect(slots(page).last()).toHaveAttribute("data-state", "wrong");
  await expect(card.locator("figure.staff-card figcaption").first()).toContainText(
    /[A-G]b? major to [A-G]b? (major|minor), /,
  );
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page);
  }
});

test("key changes: a checked run, all right, counts toward the key-change skills", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/music/ear/progressions?answer=choice&changes=key");
  await pickMode(page, "Check");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  for (let i = 0; i < 10; i++) {
    await expect(prompt(page)).toHaveAttribute("aria-label", `Question ${i + 1}`, {
      timeout: 10_000,
    });
    for (const t of (await prompt(page).getAttribute("data-answer"))!.split(" "))
      await tap(page, t);
  }
  await expect(page.getByRole("status")).toContainText("All 10 right.");
  const run = await lastRun(page);
  expect(run.exerciseId).toBe("ear.progressions");
  expect(run.params.changes).toBe("key");
  expect(run.score).toBe(1);
});

test("analysis: a tune's chords marked with key and function, the rule after a miss", async ({
  page,
}) => {
  await page.goto("/music/circle?mode=analysis&tune=tune-all-the-things-you-are");
  await expect(page.getByText("All the Things You Are").first()).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const card = page.locator("article[data-mode]");
  await expect(card).toHaveAttribute("data-answer", "Ab|vi");
  await expect(card).toContainText("Bar 1: Fm7");
  const chart = card.getByRole("list", { name: /All the Things You Are/ });
  await expect(chart.getByRole("listitem")).toHaveCount(36);
  const keys = page.getByRole("group", { name: "Key centre" });
  const fns = page.getByRole("group", { name: "Function" });
  await expect(keys.getByRole("button")).toHaveText(["Ab", "C", "Eb", "G", "E"]);
  // Right key, wrong function: half credit, and the rule for vi.
  await keys.getByRole("button", { name: "Ab", exact: true }).click();
  await fns.getByRole("button", { name: "ii", exact: true }).click();
  await expect(card).toContainText("It was Ab, vi.");
  await expect(card).toContainText("Not part of a cadence");
  await page.keyboard.press("Enter");
  await expect(card).toHaveAttribute("data-answer", "Ab|ii");
  await fns.getByRole("button", { name: "ii", exact: true }).click();
  await keys.getByRole("button", { name: "Ab", exact: true }).click();
  await expect(card).toContainText("Right: Ab, ii.");
  await expect(chart.getByRole("listitem").first()).toContainText("Ab vi");
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page);
  }
});

test("analysis: a checked run of Blue Bossa, all right, records the tune", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/music/circle?mode=analysis&tune=tune-blue-bossa");
  await pickMode(page, "Check");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const card = page.locator("article[data-mode]");
  for (let i = 0; i < 13; i++) {
    await expect(card).toHaveAttribute("aria-label", `Prompt ${i + 1}`);
    await expect(card).toHaveAttribute("data-step", "answer");
    const [k, f] = (await card.getAttribute("data-answer"))!.split("|");
    await page
      .getByRole("group", { name: "Key centre" })
      .getByRole("button", { name: k, exact: true })
      .click();
    await page
      .getByRole("group", { name: "Function" })
      .getByRole("button", { name: f, exact: true })
      .click();
  }
  await expect(page.getByRole("status")).toContainText("All 13 chords of Blue Bossa right.");
  const run = await lastRun(page);
  expect(run.exerciseId).toBe("theory.circle.analysis");
  expect(run.params).toMatchObject({ mode: "analysis", tune: "tune-blue-bossa" });
  expect(run.score).toBe(1);
});

test("in-key drills: a new key every 3 prompts, set again with I, IV, V, I", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/music/ear/chord-functions?answer=listen-along&keyEvery=3");
  await expect(page.getByText("Setup:").locator("..")).toContainText("a new key every 3");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const keys: string[] = [];
  for (let i = 0; i < 4; i++) {
    await expect(prompt(page)).toHaveAttribute("aria-label", `Question ${i + 1}`, {
      timeout: 15_000,
    });
    keys.push((await prompt(page).getAttribute("data-key"))!);
    if (i === 3)
      await expect(page.getByRole("status")).toContainText(/Key of .+, then the question/);
  }
  expect(new Set(keys.slice(0, 3)).size).toBe(1);
  expect(keys[3]).not.toBe(keys[2]);
});
