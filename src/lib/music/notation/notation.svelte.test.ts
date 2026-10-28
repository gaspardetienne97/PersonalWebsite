import { describe, expect, it, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import type { Score } from "@repo/music-core";
import Staff from "./Staff.svelte";
import Tab from "./Tab.svelte";
import Waterfall from "./Waterfall.svelte";
import FingeringRow from "./FingeringRow.svelte";

const piano: Score = {
  id: "t",
  title: "Two hands",
  bpm: 96,
  meter: { beats: 4, beatUnit: 4 },
  keyFifths: 0,
  lengthBeats: 16,
  voices: [
    {
      id: "rh",
      name: "Right hand",
      hand: "right",
      notes: [60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60].map((midi, i) => ({
        midi,
        startBeat: i,
        durationBeats: 1,
      })),
    },
    {
      id: "lh",
      name: "Left hand",
      hand: "left",
      notes: [48, 43, 45, 41, 48, 43, 41, 48].map((midi, i) => ({
        midi,
        startBeat: i * 2,
        durationBeats: 2,
      })),
    },
  ],
};

const svgIn = async (el: HTMLElement) => {
  await vi.waitFor(() => expect(el.querySelector(".host svg")).toBeTruthy(), { timeout: 10000 });
  return el.querySelector(".host svg") as SVGSVGElement;
};

describe("Staff", () => {
  it("engraves a grand staff with one cursor spanning both staves", async () => {
    const { container } = render(Staff, { score: piano, cursorBeat: 1 });
    const svg = await svgIn(container);
    expect(svg.querySelectorAll(".vf-stavenote").length).toBeGreaterThan(20);
    await vi.waitFor(() => expect(container.querySelectorAll("[data-cursor]").length).toBe(1));
    const cursor = container.querySelector<HTMLElement>("[data-cursor]")!;
    const staves = svg.querySelectorAll(".vf-stave");
    const firstSystemStaves = [...staves].slice(0, 2).map((s) => s.getBoundingClientRect());
    const c = cursor.getBoundingClientRect();
    expect(c.width).toBe(2);
    // Spans treble top line to bass bottom line of the system.
    expect(c.top).toBeLessThanOrEqual(Math.min(...firstSystemStaves.map((r) => r.top)) + 40);
    expect(c.bottom).toBeGreaterThanOrEqual(
      Math.max(...firstSystemStaves.map((r) => r.bottom)) - 40,
    );
    expect(c.height).toBeGreaterThan(120);
  });

  it("selects a range with two bar taps and shows the Start handle after the first", async () => {
    const onselect = vi.fn();
    const { container } = render(Staff, { score: piano, onselect });
    await svgIn(container);
    await page.getByRole("button", { name: "Bar 2", exact: true }).click();
    await expect.element(page.getByText("Start, bar 2", { exact: true })).toBeVisible();
    expect(onselect).not.toHaveBeenCalled();
    await page.getByRole("button", { name: /^Bar 3/ }).click();
    expect(onselect).toHaveBeenCalledWith({ startBeat: 4, endBeat: 12 });
    await expect
      .element(page.getByText("Start, bar 2. End, bar 3. 2 bars, 5 s at 96 BPM"))
      .toBeVisible();
    await expect.element(page.getByText("End, bar 3", { exact: true })).toBeVisible();
  });

  it("selects a range from the keyboard", async () => {
    const onselect = vi.fn();
    const { container } = render(Staff, { score: piano, onselect });
    await svgIn(container);
    const bar1 = page.getByRole("button", { name: "Bar 1", exact: true });
    (bar1.element() as HTMLElement).focus();
    await userEvent.keyboard("{ArrowRight}{Enter}{ArrowRight}{ArrowRight}{Enter}");
    expect(onselect).toHaveBeenCalledWith({ startBeat: 4, endBeat: 16 });
    await expect.element(page.getByRole("button", { name: "Bar 4, range end" })).toHaveFocus();
  });

  it("colours group notes and marks a wrong group", async () => {
    const { container } = render(Staff, { score: piano, groupStates: { 0: "active", 1: "wrong" } });
    await svgIn(container);
    await vi.waitFor(() =>
      expect(container.querySelectorAll('g[data-state="active"]').length).toBe(2),
    );
    expect(container.querySelector(".mark.wrong")?.textContent).toBe("×");
  });

  it("falls back with a reason when it cannot engrave", async () => {
    const onfallback = vi.fn();
    const triplets: Score = {
      ...piano,
      voices: [
        { id: "a", name: "A", notes: [{ midi: 60, startBeat: 1 / 5, durationBeats: 1 / 5 }] },
      ],
    };
    render(Staff, { score: triplets, onfallback });
    await expect
      .element(
        page.getByText(/The staff can't draw this score: it has tuplets other than triplets/),
      )
      .toBeVisible();
    expect(onfallback).toHaveBeenCalledOnce();
  });

  it("engraves eighth triplets with a 3, a left-hand clef change, and hides beams and ties with masked notes", async () => {
    const score: Score = {
      ...piano,
      lengthBeats: 8,
      voices: [
        {
          id: "rh",
          name: "Right hand",
          hand: "right",
          notes: [
            ...[72, 74, 76].map((midi, i) => ({ midi, startBeat: i / 3, durationBeats: 1 / 3 })),
            { midi: 77, startBeat: 1, durationBeats: 0.5 },
            { midi: 79, startBeat: 1.5, durationBeats: 0.5 },
            { midi: 81, startBeat: 2, durationBeats: 2 + 4 },
          ],
        },
        {
          id: "lh",
          name: "Left hand",
          hand: "left",
          clefChanges: [{ startBeat: 4, clef: "treble" }],
          notes: [
            { midi: 48, startBeat: 0, durationBeats: 4 },
            { midi: 60, startBeat: 4, durationBeats: 4 },
          ],
        },
      ],
    };
    // Groups: 0-2 the triplet, 3 and 4 the beamed eighths, 5 the tied note, 6 the left hand's second bar.
    const { container, rerender } = render(Staff, { score });
    const svg = await svgIn(container);
    expect(svg.querySelectorAll(".vf-tuplet").length).toBe(1);
    expect(svg.querySelectorAll(".vf-clef").length).toBeGreaterThanOrEqual(3);
    expect(svg.querySelectorAll(".vf-beam").length).toBe(2);
    await rerender({ score, groupStates: { 3: "hidden", 5: "hidden" } });
    // The rerender engraves afresh, so look in the container again.
    await vi.waitFor(() => {
      expect(container.querySelectorAll('.vf-beam[data-state="hidden"]').length).toBe(1);
      expect(
        container.querySelectorAll('.vf-stavetie[data-state="hidden"]').length,
      ).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("Tab", () => {
  const guitar = { name: "Standard", openStrings: [64, 59, 55, 50, 45, 40], fretCount: 22 };
  const riff: Score = {
    ...piano,
    title: "Riff",
    lengthBeats: 4,
    voices: [
      {
        id: "g",
        name: "Guitar",
        notes: [40, 43, 45, 47].map((midi, i) => ({ midi, startBeat: i, durationBeats: 1 })),
      },
    ],
  };

  it("draws fret numbers", async () => {
    const { container } = render(Tab, { score: riff, tuning: guitar });
    const svg = await svgIn(container);
    await vi.waitFor(() => expect(svg.querySelectorAll(".vf-tabnote").length).toBe(4));
    const text = [...svg.querySelectorAll(".vf-tabnote text")].map((t) => t.textContent);
    expect(text).toEqual(["0", "3", "0", "2"]);
  });

  it("says so when most notes do not fit the tuning", async () => {
    const low: Score = {
      ...riff,
      voices: [{ ...riff.voices[0], notes: riff.voices[0].notes.map((n) => ({ ...n, midi: 30 })) }],
    };
    render(Tab, { score: low, tuning: guitar });
    await expect.element(page.getByText(/4 of 4 notes are outside this tuning/)).toBeVisible();
  });
});

describe("Waterfall and fingering", () => {
  it("drops notes on the columns of their keys", async () => {
    const { container } = render(Waterfall, { score: piano, low: 48, high: 72, beat: 0 });
    await vi.waitFor(() => expect(container.querySelectorAll(".note").length).toBeGreaterThan(4));
    expect(container.querySelector(".note.left")).toBeTruthy();
    expect(container.querySelector(".note.right")).toBeTruthy();
  });

  it("draws one diagram per note and says when there is none", async () => {
    const tune: Score = {
      ...piano,
      voices: [
        {
          id: "w",
          name: "Wind",
          notes: [62, 74, 40].map((midi, i) => ({ midi, startBeat: i, durationBeats: 1 })),
        },
      ],
    };
    const { container } = render(FingeringRow, { score: tune });
    await vi.waitFor(() => expect(container.querySelectorAll("li").length).toBe(3));
    expect(container.querySelectorAll("li svg").length).toBe(2);
    await expect.element(page.getByText("no fingering")).toBeVisible();
  });
});
