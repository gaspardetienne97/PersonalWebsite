import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import DemoBeatLane from "./DemoBeatLane.svelte";

const BEATS = [
  { left: true, right: true },
  { left: false, right: true },
  { left: true, right: true },
  { left: true, right: false },
];

function cells(hand: "left" | "right"): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[data-hand="${hand}"] [data-beat]`)];
}

describe("DemoBeatLane", () => {
  test("draws one cell per beat per hand, left outlined above right filled", () => {
    render(DemoBeatLane, { beats: BEATS });

    expect(cells("left")).toHaveLength(4);
    expect(cells("right")).toHaveLength(4);
    // Left is an outline, right is a fill — the two hands are told apart without colour alone.
    expect(cells("left")[0]?.className).toContain("border-hand-left");
    expect(cells("right")[0]?.className).toContain("bg-hand-right");
    // A beat the hand does not play stays empty.
    expect(cells("left")[1]?.dataset.on).toBe("false");
    expect(cells("right")[3]?.dataset.on).toBe("false");
    // Reading order: the left-hand row comes first.
    const rows = [...document.querySelectorAll("[data-hand]")];
    expect(rows[0]?.getAttribute("data-hand")).toBe("left");
  });

  test("marks the beat that is sounding right now", async () => {
    const lane = render(DemoBeatLane, { beats: BEATS, current: 2 });

    expect(cells("left").map((cell) => cell.dataset.current)).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);

    await lane.rerender({ beats: BEATS, current: -1 });
    expect(cells("left").every((cell) => cell.dataset.current === "false")).toBe(true);
  });

  test("marks the beats the hands did not strike together", () => {
    render(DemoBeatLane, { beats: BEATS, apart: [false, false, true, false] });

    expect(cells("left").map((cell) => cell.dataset.apart)).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);
    expect(document.body.textContent).toContain("Hands apart on cell 3");
  });

  test("caps the spoken apart list and says how many are left", () => {
    render(DemoBeatLane, {
      beats: Array.from({ length: 10 }, () => ({ left: true, right: true })),
      apart: Array.from({ length: 10 }, () => true),
    });

    expect(document.body.textContent).toContain(
      "Hands apart on cell 1, 2, 3, 4, 5, 6, 7, 8, and 2 more.",
    );
  });

  test("a hand that plays nothing gets no row, and the sentence says so", () => {
    render(DemoBeatLane, {
      beats: [
        { left: false, right: true },
        { left: false, right: true },
      ],
    });

    expect(document.querySelectorAll("[data-hand]")).toHaveLength(1);
    expect(cells("left")).toHaveLength(0);
    expect(cells("right")).toHaveLength(2);
    expect(document.body.textContent).toContain("right hand only");
    expect(document.body.textContent).not.toContain("left hand above right hand");
  });

  test("names itself and says nothing about together when nothing is marked", () => {
    render(DemoBeatLane, { beats: BEATS, label: "Demo beat lane" });

    expect(document.querySelector('[aria-label="Demo beat lane"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Demo beat lane: 4 cells, one per onset");
    expect(document.body.textContent).not.toContain("Hands apart");
  });
});
