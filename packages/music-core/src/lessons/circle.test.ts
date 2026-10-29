import { describe, expect, it } from "vitest";
import { FLAT_ORDER, SHARP_ORDER } from "../theory/circle";
import { lessonProblems } from "./check";
import { circleLessons } from "./circle";

describe("circle lessons", () => {
  it("the order lesson shows the sharps and flats from the theory code", () => {
    const [l] = circleLessons("order");
    const text = JSON.stringify(l);
    expect(l.id).toBe("circle.order");
    expect(text).toContain(SHARP_ORDER.join(" "));
    expect(text).toContain(FLAT_ORDER.join(" "));
    expect(lessonProblems(l)).toEqual([]);
  });
});
