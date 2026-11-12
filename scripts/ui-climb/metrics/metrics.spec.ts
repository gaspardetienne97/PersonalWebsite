// Task metrics for the next pass, written to .ui-climb/metrics/<UI_CLIMB_ROUND>.json:
//   taps      taps (trusted pointerdowns) to the first sound, from Today's top card and from
//             one drill card per trainer, with lessons off and on
//   verdict   ms from a fake MIDI note to its verdict painted (a [data-verdict] change, then
//             two frames), p50 and p95 per drill: a regression guard, not a gate
//   layout    clipped elements and buttons under a fixed or sticky bar, per page and size
//   results   score, stars and verdict word agree with trend.ts on every results screen reached
//   UI_CLIMB_ROUND=10 npx playwright test -c scripts/ui-climb/metrics/playwright.metrics.config.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADVANCE } from "@repo/music-core/progress/advance";
import {
  metricScore,
  starsFor,
  verdictWord,
  type Stars,
} from "../../../src/lib/music/components/trend";
import { installFakeMidi, muteHmr, PORTS } from "../../../e2e/music/fixtures";
import { lessons, mode, open, startTheme, VIEWPORTS } from "../capture/lib";
import { answerEar, earContinue, earQuestion, patchSettings } from "../capture/hub-drills";

const ROUND = process.env.UI_CLIMB_ROUND ?? "0";
const OUT = resolve(import.meta.dirname, "../../../.ui-climb/metrics", `${ROUND}.json`);
const KEYS = PORTS.keys.id;

/** Merge one result into the round's file (each test writes its own part, so a failure keeps the rest). */
function record(section: string, key: string, value: unknown) {
  mkdirSync(dirname(OUT), { recursive: true });
  let all: Record<string, Record<string, unknown>> = {};
  try {
    all = JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    // first write of the round
  }
  all[section] = { ...all[section], [key]: value };
  all.meta = {
    ...all.meta,
    round: ROUND,
    at: new Date().toISOString(),
    base: test.info().project.use.baseURL,
  };
  writeFileSync(OUT, JSON.stringify(all, null, 2) + "\n");
}

/**
 * Before the app loads: count trusted pointerdowns (per tab, across reloads), stamp the first
 * audible source start (Tone's own constant sources and offline feature tests left out), log
 * every note-on sent over the fake MIDI port, and every painted verdict.
 */
function probes() {
  const w = window as any;
  const ss = sessionStorage;
  const taps = () => Number(ss.getItem("m.taps") ?? 0);
  addEventListener(
    "pointerdown",
    (e) => e.isTrusted && ss.setItem("m.taps", String(taps() + 1)),
    true,
  );
  const stamp = (key: string) =>
    ss.getItem(key) === null &&
    ss.setItem(
      key,
      JSON.stringify({
        taps: taps(),
        url: location.pathname,
        lesson: !!document.querySelector('[data-testid="lesson"]'),
      }),
    );
  // AudioBufferSourceNode (samples) has its own start, so both are wrapped.
  for (const proto of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
    const start = proto.start;
    proto.start = function (this: AudioScheduledSourceNode, ...a: number[]) {
      const r = start.apply(this, a as []);
      if (!(this instanceof ConstantSourceNode) && !(this.context instanceof OfflineAudioContext))
        stamp("m.first");
      return r;
    };
  }
  // The run has begun: the shell's status says so (as the e2e startDrill waits for).
  new MutationObserver(() => {
    const s = document.querySelector('[data-session] [role="status"], [role="status"]');
    if (s && /Go\.|Listen|Play|Question/.test(s.textContent ?? "")) stamp("m.run");
  }).observe(document, { subtree: true, childList: true, characterData: true });
  w.__sends = [] as number[];
  w.__paints = [] as { mut: number; paint: number }[];
  const wrap = (m: any) => {
    if (!m || m.__wrapped) return m;
    const send = m.send.bind(m);
    m.send = (id: string, bytes: number[], at?: number) => {
      if ((bytes[0] & 0xf0) === 0x90 && bytes[2] > 0) w.__sends.push(performance.now());
      return send(id, bytes, at);
    };
    m.__wrapped = true;
    return m;
  };
  let midi = wrap(w.__midi);
  Object.defineProperty(w, "__midi", {
    configurable: true,
    get: () => midi,
    set: (v) => (midi = wrap(v)),
  });
  const lit = (n: Node) =>
    n instanceof Element &&
    (n.matches('[data-verdict]:not([data-verdict=""])') ||
      !!n.querySelector('[data-verdict]:not([data-verdict=""])'));
  new MutationObserver((ms) => {
    const hit = ms.some((m) =>
      m.type === "attributes"
        ? ((m.target as Element).getAttribute("data-verdict") ?? "") !== ""
        : [...m.addedNodes].some(lit),
    );
    if (!hit) return;
    const mut = performance.now();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => w.__paints.push({ mut, paint: performance.now() })),
    );
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-verdict", "data-verdict-key"],
  });
}

async function fresh(page: Page, o: { lessonsOn?: boolean; size?: keyof typeof VIEWPORTS } = {}) {
  await page.addInitScript(probes);
  await muteHmr(page);
  await startTheme(page, "light");
  await lessons(page, !!o.lessonsOn);
  await page.setViewportSize(VIEWPORTS[o.size ?? "desktop"]);
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]);
};

// ---------------------------------------------------------------------------------------------
// Taps to the first note

/** From the page as it is: the shortest way in (skip a lesson, press Start) until a sound starts. */
async function tapsToSound(page: Page) {
  const read = (k: string) =>
    page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) ?? "null"), k);
  for (let i = 0; i < 8 && !(await read("m.first")); i++) {
    const skip = page.getByRole("button", { name: "Skip, I know this" });
    const startBtn = page.getByRole("button", { name: /^Start$/ }).first();
    if (await skip.isVisible().catch(() => false)) await skip.click();
    else if (!(await read("m.run")) && (await startBtn.isVisible().catch(() => false)))
      await startBtn.click();
    await page.waitForTimeout(1500);
  }
  // A run that waits for the player makes no sound of its own: its start is the figure then.
  const first = await read("m.first");
  const run = await read("m.run");
  return {
    taps: first?.taps ?? null,
    firstSoundIn: first ? (first.lesson ? "lesson" : first.url) : null,
    tapsToRunStart: run?.taps ?? null,
  };
}

const CARDS = [
  ["ear", "Intervals"],
  ["rhythm", "Rhythm"],
  ["jazz", "Voicings"],
  ["piano", "Scales"],
] as const;

for (const lessonsOn of [false, true]) {
  const tag = lessonsOn ? "lessons-on" : "lessons-off";
  test(`taps from Today's top card, ${tag}`, async ({ page }) => {
    await fresh(page, { lessonsOn });
    await open(page, "/music");
    const card = page.getByRole("link", { name: /^Start with / }).first();
    const label = (await card.textContent())?.trim();
    await card.click();
    record("taps", `today ${tag}`, { card: label, ...(await tapsToSound(page)) });
  });

  for (const [trainer, title] of CARDS)
    test(`taps from the ${trainer} drill card, ${tag}`, async ({ page }) => {
      await fresh(page, { lessonsOn });
      await open(page, "/music?tab=drills");
      await page.getByRole("main").getByRole("link", { name: title, exact: true }).first().click();
      record("taps", `${trainer} card (${title}) ${tag}`, await tapsToSound(page));
    });
}

// ---------------------------------------------------------------------------------------------
// Results contradictions and layout, shared by the runs below

const BANDS = { pass: ADVANCE.pass, fail: ADVANCE.fail };

/** Score, stars and verdict word on the results card, checked against trend.ts. */
async function checkResults(page: Page, where: string) {
  const card = page.getByTestId("results").first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const r = await card.evaluate((el) => ({
    score: el.getAttribute("data-score"),
    stars: el.getAttribute("data-stars"),
    starsLabel:
      el.querySelector('[data-testid="results-stars"]')?.getAttribute("aria-label") ?? null,
    verdict: el.querySelector('[data-testid="results-verdict"]')?.textContent?.trim() ?? null,
    metric: el.querySelector('[data-testid="results-metric"]')?.textContent?.trim() ?? null,
  }));
  const problems: string[] = [];
  const score = r.score === null || r.score === "" ? undefined : Number(r.score);
  const stars = r.stars === null ? null : (Number(r.stars) as Stars);
  if (stars !== null) {
    const shown = Number(/^(\d) of 3 stars/.exec(r.starsLabel ?? "")?.[1]);
    if (shown !== stars) problems.push(`stars drawn ${shown}, card says ${stars}`);
    if (score !== undefined) {
      // The third star needs the drill's own pass, which the page does not show: 2 or 3 at the pass band.
      const want = starsFor(score, false);
      if (!(stars === want || (want === 2 && stars === 3)))
        problems.push(`score ${score} gives ${want} stars, shows ${stars}`);
      if (score < BANDS.pass && stars >= 2) problems.push(`${stars} stars under ${BANDS.pass}`);
    }
    const word = verdictWord(stars, score);
    if (r.verdict !== word) problems.push(`verdict "${r.verdict}", rule says "${word}"`);
  } else if (r.verdict) problems.push(`verdict "${r.verdict}" with no stars`);
  const ms = r.metric ? metricScore(r.metric) : undefined;
  if (ms !== undefined && score !== undefined && Math.round(ms * 100) !== Math.round(score * 100))
    problems.push(`metric ${r.metric} vs score ${score}`);
  const out = { ...r, problems };
  record("results", where, out);
  return out;
}

/**
 * Elements cut off or spilling (scrollWidth or scrollHeight over the client box; not scroll
 * containers, not marked data-truncate-ok), whether the page scrolls sideways, and buttons
 * whose centre lands on a fixed or sticky element at both the top and the end of the page.
 */
async function layout(page: Page) {
  return page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const desc = (el: Element) => {
      const t = el.getAttribute("data-testid");
      const cls = [...el.classList].slice(0, 3).join(".");
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${el.tagName.toLowerCase()}${t ? `[data-testid=${t}]` : ""}${cls ? `.${cls}` : ""}${text ? ` "${text}"` : ""}`;
    };
    // Cut: the overflow is hidden, so content is lost. Spill: it shows, over whatever is beside it
    // (mostly a glyph taller than its line box, so spill is listed and counted apart).
    const clipped: string[] = [];
    const spill: string[] = [];
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      if (!(el instanceof HTMLElement) || el.closest("[data-truncate-ok]")) continue;
      if (el.clientWidth <= 1 || el.clientHeight <= 1) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.display === "contents")
        continue;
      if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) continue;
      const x = el.scrollWidth - el.clientWidth;
      const y = el.scrollHeight - el.clientHeight;
      if (x <= 1 && y <= 1) continue;
      const cut = (x > 1 && cs.overflowX !== "visible") || (y > 1 && cs.overflowY !== "visible");
      (cut ? clipped : spill).push(`${desc(el)} +${x > 1 ? `${x}w` : ""}${y > 1 ? `${y}h` : ""}`);
    }
    const pageScrollsSideways = document.documentElement.scrollWidth > innerWidth + 1;
    const buttons = [
      ...document.querySelectorAll<HTMLElement>(
        'button, a[href], [role="button"], [role="tab"], input, select',
      ),
    ].filter((b) => {
      const r = b.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        getComputedStyle(b).visibility !== "hidden" &&
        !b.closest('[aria-hidden="true"], .sr-only')
      );
    });
    const fixedOf = (el: Element | null) => {
      for (; el; el = el.parentElement) {
        const p = getComputedStyle(el).position;
        if (p === "fixed" || p === "sticky") return el;
      }
      return null;
    };
    const state = new Map<HTMLElement, { ok: boolean; by?: string }>();
    for (const y of [0, document.documentElement.scrollHeight]) {
      window.scrollTo(0, y);
      await frame();
      for (const b of buttons) {
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
        const hit = document.elementFromPoint(cx, cy);
        const cover = hit && !b.contains(hit) && !hit.contains(b) ? fixedOf(hit) : null;
        const s = state.get(b);
        if (!cover || cover.contains(b)) state.set(b, { ok: true });
        else if (!s?.ok) state.set(b, { ok: false, by: desc(cover).slice(0, 60) });
      }
    }
    window.scrollTo(0, 0);
    const covered = [...state].filter(([, s]) => !s.ok).map(([b, s]) => `${desc(b)} under ${s.by}`);
    return { clipped, spill, covered, pageScrollsSideways };
  });
}

// ---------------------------------------------------------------------------------------------
// Verdict paint: real runs over fake MIDI

/** Pair each note (or chord) sent with the first verdict painted after it, before the next. */
async function verdictTimes(page: Page) {
  const { sends, paints } = await page.evaluate(() => ({
    sends: (window as any).__sends as number[],
    paints: (window as any).__paints as { mut: number; paint: number }[],
  }));
  const groups = sends.filter((t, i) => i === 0 || t - sends[i - 1] > 5);
  const ms: number[] = [];
  groups.forEach((t, i) => {
    const until = Math.min(groups[i + 1] ?? Infinity, t + 1000);
    const p = paints.find((x) => x.mut >= t && x.mut < until);
    if (p) ms.push(p.paint - t);
  });
  return {
    notes: groups.length,
    painted: ms.length,
    p50: pct(ms, 50),
    p95: pct(ms, 95),
    max: pct(ms, 100),
  };
}

/** Arm notes to play from the moment the status says "Go." (lead 0, so the send time is the note's time). */
async function armOnGo(page: Page, steps: { at: number; notes: number[] }[]) {
  await page.evaluate(
    ({ steps, port }) => {
      (window as any).__goDone = new Promise<void>((done) => {
        const status = document.querySelector('[role="status"]')!;
        const obs = new MutationObserver(() => {
          if (status.textContent?.trim() !== "Go.") return;
          obs.disconnect();
          const m = (window as any).__midi;
          steps.forEach((s, i) =>
            setTimeout(() => {
              for (const n of s.notes) m.send(port, [0x90, n, 96]);
              setTimeout(() => s.notes.forEach((n) => m.send(port, [0x80, n, 0])), 150);
              if (i === steps.length - 1) setTimeout(done, 300);
            }, s.at),
          );
        });
        obs.observe(status, { childList: true, characterData: true, subtree: true });
      });
    },
    { steps, port: KEYS },
  );
}

async function midiPage(page: Page, url: string, instrument: string) {
  await fresh(page);
  await installFakeMidi(page, [PORTS.keys]);
  await open(page, "/music");
  await patchSettings(page, {
    midiEnabledBefore: true,
    countInBars: 1,
    activeInstrument: instrument,
  });
  await open(page, url);
  await mode(page, "Practice");
}

const startButton = (page: Page) => page.getByRole("button", { name: /^(Start|Again)$/ }).first();

/** Arm the notes, then press Start (a real click, so the run starts as a player's would). */
async function run(page: Page, steps: { at: number; notes: number[] }[]) {
  await armOnGo(page, steps);
  await startButton(page).click();
  await page.evaluate(() => (window as any).__goDone);
}

test("verdict paint: rhythm pulse", async ({ page }) => {
  await midiPage(page, "/music/rhythm?mode=pulse&beats=16&bpm=80", "piano");
  // Tap from the stage's own downbeat, each beat on time with a player's few ms either side.
  const before = await page.locator("[data-beat-ms]").first().getAttribute("data-downbeat");
  await startButton(page).click();
  const stage = page.locator("[data-beat-ms]").first();
  await expect
    .poll(async () => (await stage.getAttribute("data-downbeat")) !== before, { timeout: 20_000 })
    .toBe(true);
  await page.evaluate(
    ({ port }) => {
      const s = document.querySelector("[data-beat-ms]")!;
      const d = Number(s.getAttribute("data-downbeat"));
      const b = Number(s.getAttribute("data-beat-ms"));
      const m = (window as any).__midi;
      for (let i = 0; i < 16; i++)
        setTimeout(
          () => {
            m.send(port, [0x90, 60, 100]);
            setTimeout(() => m.send(port, [0x80, 60, 0]), 90);
          },
          Math.max(0, d + i * b + ((i * 7) % 11) - 5 - performance.now()),
        );
    },
    { port: KEYS },
  );
  await expect(page.getByTestId("results").first()).toBeVisible({ timeout: 40_000 });
  record("verdict", "rhythm", await verdictTimes(page));
  await checkResults(page, "rhythm pulse");
  record("layout", "results: rhythm desktop", await layout(page));
});

test("verdict paint: scales (piano)", async ({ page }) => {
  await midiPage(
    page,
    "/music/scales?pattern=scale&kind=major&tonic=60&span=one-octave&motion=up&hands=right&perBeat=1&grade=&bpm=60",
    "piano",
  );
  await run(
    page,
    [60, 62, 64, 65, 67, 69, 71, 72].map((n, i) => ({ at: i * 1000, notes: [n] })),
  );
  await expect(page.getByTestId("results").first()).toBeVisible({ timeout: 40_000 });
  record("verdict", "scales", await verdictTimes(page));
  await checkResults(page, "scales");
  record("layout", "results: scales desktop", await layout(page));
});

test("verdict paint: voicings (jazz)", async ({ page }) => {
  await midiPage(page, "/music/voicings?variant=major&key=0&keys=1&strict=1", "piano");
  await startButton(page).click();
  await expect(page.getByRole("status")).toContainText("Play", { timeout: 10_000 });
  for (let i = 0; i < 3; i++) {
    const keys = page.locator(".piano [data-target]");
    await expect(keys.first()).toBeVisible();
    const notes = await keys.evaluateAll((els) =>
      els.map((e) => Number(e.getAttribute("data-midi"))),
    );
    await page.evaluate(
      ({ notes, port }) => {
        const m = (window as any).__midi;
        notes.forEach((n) => m.send(port, [0x90, n, 90]));
        setTimeout(() => notes.forEach((n) => m.send(port, [0x80, n, 0])), 300);
      },
      { notes, port: KEYS },
    );
    await page.waitForTimeout(1000);
  }
  await expect(page.getByTestId("results").first()).toBeVisible({ timeout: 40_000 });
  record("verdict", "voicings", await verdictTimes(page));
  await checkResults(page, "voicings");
  record("layout", "results: voicings desktop", await layout(page));
});

test("results: ear intervals, two answers wrong", async ({ page }) => {
  await fresh(page);
  await open(page, "/music/ear/intervals");
  await mode(page, "Check");
  await startButton(page).click();
  const card = page.locator("article[data-drill]");
  for (let i = 1; i <= 10; i++) {
    await earQuestion(page, i);
    await answerEar(page, i !== 3 && i !== 7);
    if (i === 10) break;
    await expect(async () => {
      if ((await card.getAttribute("data-step", { timeout: 1000 })) === "feedback")
        await earContinue(page);
      await expect(card).toHaveAttribute("aria-label", `Question ${i + 1}`, { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
  }
  await checkResults(page, "ear intervals");
  record("layout", "results: ear intervals desktop", await layout(page));
});

// ---------------------------------------------------------------------------------------------
// Clipping and cover on every hub and every drill's ready screen, at three sizes

const HUBS = [
  "/music",
  "/music?tab=drills",
  "/music?tab=paths",
  "/music/progress",
  "/music/journal",
  "/music/connect",
  "/music/tuner",
  "/music/settings",
  "/music/guide",
  "/music/library",
  "/music/create",
  "/music/record",
];
/** Every drill card's link on the Drills tab (what a player can open), hubs left out. */
async function drillLinks(page: Page) {
  await open(page, "/music?tab=drills");
  const hrefs = await page
    .getByRole("main")
    .locator('a[href^="/music/"]')
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  return [...new Set(hrefs)].filter((h) => !HUBS.includes(h.split("?")[0]));
}
/** Phone is judged for ear, rhythm and hubs; instrument drills at phone size are reported only. */
const phoneJudged = (url: string) =>
  HUBS.includes(url) || /^\/music\/(ear|rhythm|listening)\b/.test(url);

const SIZES = [
  ["desktop", false],
  ["tablet", true],
  ["phone", true],
] as const;

async function sizePage(browser: Browser, size: keyof typeof VIEWPORTS, hasTouch: boolean) {
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: VIEWPORTS[size],
    hasTouch,
    storageState: { cookies: [], origins: [] },
  });
  const page = await ctx.newPage();
  await muteHmr(page);
  await startTheme(page, "light");
  await lessons(page, false);
  return page;
}

for (const [size, hasTouch] of SIZES)
  test(`clipping and cover at ${size}`, async ({ browser }) => {
    const page = await sizePage(browser, size, hasTouch);
    const pages: Record<string, unknown> = {};
    const sum = { clipped: 0, spill: 0, covered: 0, sideways: 0 };
    const reportOnly = { ...sum };
    const drills = await drillLinks(page);
    for (const url of [...HUBS, ...drills]) {
      try {
        await open(page, url);
        const r = await layout(page);
        const judged = size !== "phone" || phoneJudged(url);
        const into = judged ? sum : reportOnly;
        into.clipped += r.clipped.length;
        into.spill += r.spill.length;
        into.covered += r.covered.length;
        into.sideways += Number(r.pageScrollsSideways);
        if (r.clipped.length || r.spill.length || r.covered.length || r.pageScrollsSideways)
          pages[url] = { ...r, ...(judged ? {} : { reportOnly: true }) };
      } catch (e) {
        pages[url] = { error: String(e).slice(0, 200) };
      }
    }
    record("layout", size, {
      size: VIEWPORTS[size],
      hasTouch,
      pagesChecked: HUBS.length + drills.length,
      ...sum,
      reportOnly,
      pages,
    });
    await page.context().close();
  });
