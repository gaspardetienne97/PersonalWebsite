import { describe, expect, it } from "vite-plus/test";
import { distance, nearest } from "./nearest.ts";

const routes = ["/about", "/studio", "/blog", "/pdf", "/blog/welcome", "/listplay"];

describe("distance", () => {
  it("counts inserts, deletes and swaps", () => {
    expect(distance("studio", "studio")).toBe(0);
    expect(distance("studoi", "studio")).toBe(2);
    expect(distance("abut", "about")).toBe(1);
    expect(distance("", "blog")).toBe(4);
  });
});

describe("nearest", () => {
  it("finds an address one or two edits away", () => {
    expect(nearest("/studoi", routes)).toBe("/studio");
    expect(nearest("/abuot", routes)).toBe("/about");
    expect(nearest("/blog/welcom", routes)).toBe("/blog/welcome");
  });

  it("ignores case and a trailing slash", () => {
    expect(nearest("/Studio/", routes)).toBe("/studio");
  });

  it("gives nothing when no address is close", () => {
    expect(nearest("/this-page-does-not-exist", routes)).toBeNull();
    expect(nearest("/blog/does-not-exist", routes)).toBeNull();
  });

  it("does not stretch a short address to fit", () => {
    // Two edits from "/pdf", but that is half of it.
    expect(nearest("/px", routes)).toBeNull();
    expect(nearest("/pdg", routes)).toBe("/pdf");
  });

  it("prefers the closer of two, and the first among equals", () => {
    expect(nearest("/blg", ["/blag", "/blog"])).toBe("/blag");
    expect(nearest("/blo", ["/about", "/blog"])).toBe("/blog");
  });
});
