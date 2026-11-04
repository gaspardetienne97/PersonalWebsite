// UI hill climb captures: the MPC pads (rudiments, grooves on the lanes, fills,
// chop) and the Aerophone, every state from ready to results at both widths, over
// the fake MPC and Aerophone MIDI ports with each hit stamped to the beat.
import { expect, test } from "@playwright/test";
import {
  AERO,
  PORTS,
  WIDTHS,
  attrFlow,
  captureLesson,
  keep,
  open,
  prep,
  shot,
  type Attrs,
  type Send,
} from "./inst-helpers";

test.describe.configure({ mode: "parallel" });

const MPC = PORTS.mpcPublic.id;
const vel = (kind?: string) => (kind === "a" ? 110 : kind === "g" ? 30 : 75);

/** Every target of a pad stage, `late` ms late. */
const hits =
  (late = 0) =>
  (a: Attrs, d: number): Send[] =>
    (JSON.parse(a["data-targets"]) as [number, number, string?][]).map(
      ([pad, at, kind]) => [pad, d + at + late, 40, vel(kind)] as Send,
    );

/** Shots inside the run at these fractions of its length. */
const span = (a: Attrs) => {
  const t = JSON.parse(a["data-targets"]) as [number, number][];
  return t.length ? t[t.length - 1][1] : 4000;
};

for (const width of WIDTHS) {
  test(`pads-rudiments ${width}`, async ({ page }) => {
    test.setTimeout(300_000);
    await prep(page, width, { midi: [PORTS.mpcPublic], instrument: "mpc", countIn: 0 });
    await attrFlow(page, {
      F: "pads-rudiments",
      width,
      url: "/music/pads?pattern=paradiddle&bpm=90",
      testId: "pads-stage",
      port: MPC,
      // A rudiment's stage carries no targets: the paradiddle's 16 hits, two a click, left pad
      // A01 (36), right pad A03 (38), as the page sets them by default.
      build: (_a, d) =>
        Array.from({ length: 16 }, (_, i) => {
          const left = "LRLLRLRR"[i % 8] === "L";
          return [left ? 36 : 38, d + (i * 60000) / 90 / 2, 40, 75] as Send;
        }),
      poor: keep(4),
      runningAt: () => 2600,
      wrong: { midi: 51, at: () => [1700, 3700] },
      check: true,
    });
  });

  test(`pads-grooves ${width}`, async ({ page }) => {
    test.setTimeout(300_000);
    await prep(page, width, { midi: [PORTS.mpcPublic], instrument: "mpc", countIn: 0 });
    const url = "/music/pads?mode=groove&groove=backbeat&bpm=90&view=lanes&ahead=2";
    await attrFlow(page, {
      F: "pads-grooves",
      width,
      url,
      testId: "pads-stage",
      port: MPC,
      build: hits(),
      poor: keep(3),
      runningAt: (a) => span(a) * 0.4,
      wrong: { midi: 51, at: (a) => [span(a) * 0.3, span(a) * 0.55] },
      check: true,
      after: async () => {
        // The same groove on the grid, and a level-3 groove's lesson.
        await open(page, "/music/pads?mode=groove&groove=backbeat&bpm=90&view=grid");
        await shot(page, "pads-grooves", "ready-grid", width);
        // Level 1 grooves have no lesson; a level 3 groove teaches counting sixteenths.
        await captureLesson(
          page,
          "pads-grooves",
          "/music/pads?mode=groove&groove=funk-sixteenths",
          width,
        );
      },
    });
  });

  test(`pads-fills ${width}`, async ({ page }) => {
    test.setTimeout(300_000);
    await prep(page, width, { midi: [PORTS.mpcPublic], instrument: "mpc", countIn: 0 });
    await attrFlow(page, {
      F: "pads-fills",
      width,
      url: "/music/pads?mode=fills&fill=down-the-toms&bpm=100",
      testId: "pad-skills",
      port: MPC,
      build: hits(),
      poor: keep(3),
      runningAt: (a) => span(a) * 0.85,
      wrong: { midi: 51, at: (a) => [span(a) * 0.5, span(a) * 0.85] },
      check: true,
      after: async () => {
        await open(page, "/music/pads?mode=fills&fill=down-the-toms&bpm=100&view=lanes");
        await shot(page, "pads-fills", "ready-lanes", width);
      },
    });
  });

  test(`pads-chop ${width}`, async ({ page }) => {
    test.setTimeout(300_000);
    await prep(page, width, { midi: [PORTS.mpcPublic], instrument: "mpc", countIn: 0 });
    const loaded = () =>
      expect(page.getByTestId("chop-stage")).toHaveAttribute("data-loaded", "true", {
        timeout: 30_000,
      });
    await attrFlow(page, {
      F: "pads-chop",
      width,
      url: "/music/pads?mode=chop&exercise=order&source=boom-bap-b&bpm=84",
      testId: "chop-stage",
      port: MPC,
      ready: loaded,
      build: hits(),
      poor: keep(3),
      runningAt: (a) => span(a) * 0.5,
      check: true,
      after: async () => {
        await open(page, "/music/pads?mode=chop&exercise=reorder&source=boom-bap-b&view=lanes");
        await loaded();
        await shot(page, "pads-chop", "reorder-lanes-ready", width);
      },
    });
  });

  test(`aerophone ${width}`, async ({ page }) => {
    test.setTimeout(300_000);
    await prep(page, width, { midi: [PORTS.aerophone], instrument: "aerophone", countIn: 0 });
    /** The stage's line in time: the air stopped and started for each note, breath held between. */
    const line = (a: Attrs, d: number): Send[] => {
      const notes = a["data-line"].split(",").map(Number);
      const step = Number(a["data-step-ms"]);
      return notes.flatMap((m, i): Send[] => {
        const at = d + i * step;
        const out: Send[] = [
          { bytes: [0xb0, 2, 10], at: at - 30 },
          { bytes: [0x90, m, 90], at },
          { bytes: [0xb0, 2, 80], at: at + 20 },
          { bytes: [0xb0, 2, 80], at: at + step / 2 },
          { bytes: [0x80, m, 0], at: at + step - 60 },
        ];
        return out;
      });
    };
    await attrFlow(page, {
      F: "aerophone",
      width,
      url: "/music/aerophone?mode=scales&scale=major&key=0&perBeat=1&bpm=90",
      testId: "aero-skills",
      port: AERO,
      build: line,
      poor: (s) => s.slice(0, 15),
      runningAt: (a) => 5.4 * Number(a["data-step-ms"]),
      wrong: {
        midi: 61,
        at: (a) => [3.4 * Number(a["data-step-ms"]), 9.4 * Number(a["data-step-ms"])],
      },
      check: true,
      after: async () => {
        // The fingering chart and a long tone, ready.
        // Scales have no intro lesson; the long tone has one.
        await captureLesson(page, "aerophone", "/music/aerophone?mode=long-tone&level=mf", width);
        await open(page, "/music/aerophone?mode=fingering");
        await shot(page, "aerophone", "fingering-ready", width);
        await open(page, "/music/aerophone?mode=long-tone&target=67&seconds=3&level=mf");
        await shot(page, "aerophone", "long-tone-ready", width);
      },
    });
  });
}
