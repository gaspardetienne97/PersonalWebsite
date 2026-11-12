// Does a drill's ready screen and its run fit one view? Logs the page's vertical scroll
// (px over the viewport) at the laptop and tablet sizes and saves a screenshot of each.
//   FIT_OUT=<dir> npx playwright test -c scripts/ui-climb/playwright.capture.config.ts fit
// FIT_BOXES=1 also prints the stage's boxes with their heights (where the height goes).
import { mkdirSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { installSyntheticMic, PORTS } from "../../../e2e/music/fixtures";
import { open, prep, startMic, WIDTHS, type Prep } from "./inst-helpers";

const OUT = process.env.FIT_OUT ?? ".ui-climb/shots/fit";
mkdirSync(OUT, { recursive: true });

const DRILLS: { name: string; url: string; prep: Prep; mic?: boolean }[] = [
  {
    name: "scales",
    url: "/music/scales?pattern=scale&kind=major&tonic=60&span=one-octave&motion=up&hands=right&perBeat=1&grade=&bpm=40",
    prep: { midi: [PORTS.keys], instrument: "piano" },
  },
  {
    name: "strum",
    url: "/music/strum?progression=guitar-g-d-em-c&choruses=1&strictness=relaxed&instrument=guitar&bpm=96",
    prep: { instrument: "guitar" },
    mic: true,
  },
  {
    name: "aerophone",
    url: "/music/aerophone?mode=scales&scale=major&key=0&perBeat=1&bpm=90",
    prep: { midi: [PORTS.aerophone], instrument: "aerophone" },
  },
  {
    name: "scales-default",
    url: "/music/scales",
    prep: { midi: [PORTS.keys], instrument: "piano" },
  },
  { name: "strum-default", url: "/music/strum", prep: { instrument: "guitar" }, mic: true },
  {
    name: "aerophone-default",
    url: "/music/aerophone",
    prep: { midi: [PORTS.aerophone], instrument: "aerophone" },
  },
  { name: "pedal-default", url: "/music/pedal", prep: { midi: [PORTS.keys], instrument: "piano" } },
  {
    name: "pedal",
    url: "/music/pedal?progression=I-IV-V-I&key=0&rounds=1&bpm=60",
    prep: { midi: [PORTS.keys], instrument: "piano" },
  },
];

const over = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);

/** The stage's boxes three levels down, with their heights: where the height goes. */
const boxes = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    const walk = (el: Element, depth: number) => {
      const r = el.getBoundingClientRect();
      if (r.height < 1) return;
      const id = el.getAttribute("data-testid") ?? el.className.toString().slice(0, 50);
      out.push(
        `${"  ".repeat(depth)}${el.tagName.toLowerCase()} ${Math.round(r.top)}+${Math.round(r.height)} ${id}`,
      );
      if (depth < 3) for (const c of el.children) walk(c, depth + 1);
    };
    walk(document.querySelector(".stage-box")!, 0);
    return out.join("\n");
  });

// FIT_PHONE=1 looks at a phone instead (usable there, not measured against a target).
for (const width of process.env.FIT_PHONE ? (["phone"] as const) : WIDTHS)
  for (const d of DRILLS)
    test(`fit ${d.name} ${width}`, async ({ page }) => {
      if (d.mic) await installSyntheticMic(page, 0);
      await prep(page, width, d.prep);
      await open(page, d.url);
      const ready = await over(page);
      if (process.env.FIT_BOXES) console.log(`BOXES ${d.name} ${width}\n${await boxes(page)}`);
      await page.screenshot({ path: `${OUT}/${d.name}-${width}-ready.png` });
      let micOn: number | undefined;
      if (d.mic) {
        await startMic(page);
        await page.waitForTimeout(300);
        micOn = await over(page);
      }
      await page.getByRole("button", { name: "Start", exact: true }).click();
      let run = 0;
      for (let i = 0; i < 16; i++) {
        await page.waitForTimeout(500);
        run = Math.max(run, await over(page));
        if (i === 13) await page.screenshot({ path: `${OUT}/${d.name}-${width}-run.png` });
      }
      console.log(
        `FIT ${d.name} ${width}: ready ${ready}${micOn === undefined ? "" : `, mic on ${micOn}`}, run ${run}`,
      );
    });
