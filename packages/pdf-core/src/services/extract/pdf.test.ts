import { describe, expect, it } from "vite-plus/test";

import { reconstructPage } from "./pdf";

/** A run of text as pdf.js reports it: `y` is measured up from the bottom of the page. */
const run = (str: string, x: number, y: number, width = str.length * 6) => ({
  str,
  width,
  transform: [12, 0, 0, 12, x, y],
});

describe("reconstructPage", () => {
  it("reads a page from its top line down, whatever order the runs arrive in", () => {
    const page = [
      run("eternity remains.", 72, 660),
      run("Economy", 72, 720),
      run("Time is but the stream", 72, 690),
      run("but", 72, 675),
    ];

    expect(reconstructPage(page)).toBe(
      "Economy\n\nTime is but the stream\nbut\neternity remains.",
    );
  });

  it("keeps the runs of one line in order, with a space where there is a gap", () => {
    const page = [run("keep your accounts", 110, 700), run("the", 72, 700, 18), run("on", 72, 685)];

    expect(reconstructPage(page)).toBe("the keep your accounts\non");
  });
});
