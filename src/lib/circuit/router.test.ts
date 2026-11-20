import { describe, expect, it } from "vite-plus/test";
import { DIRECTIONS, growCircuit, headingFor, logoColorAt, ringRoots, type Chain } from "./router";

const PITCH = 16;
const base = {
  width: 960,
  height: 640,
  pitch: PITCH,
  roots: ringRoots(480, 320, 90, 22),
  blocked: (x: number, y: number) => Math.hypot(x - 480, y - 320) < 90,
};

/** Every grid node a chain passes through, skipping its first point (pad or junction). */
const nodesOf = (chain: Chain) => {
  const nodes: string[] = [];
  for (let i = 1; i < chain.points.length; i++) {
    const a = chain.points[i - 1];
    const b = chain.points[i];
    const steps = Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / PITCH);
    for (let s = 1; s <= steps; s++)
      nodes.push(
        `${Math.round(a.x + ((b.x - a.x) * s) / steps)},${Math.round(a.y + ((b.y - a.y) * s) / steps)}`,
      );
  }
  return nodes;
};

describe("growCircuit", () => {
  it("grows the same board from the same seed", () => {
    expect(growCircuit({ ...base, seed: 7 })).toEqual(growCircuit({ ...base, seed: 7 }));
    expect(growCircuit({ ...base, seed: 7 })).not.toEqual(growCircuit({ ...base, seed: 8 }));
  });

  it("branches: side traces leave existing ones at junctions", () => {
    const board = growCircuit({ ...base, seed: 3 });
    expect(board.chains.filter((c) => c.branch).length).toBeGreaterThan(5);
    expect(board.junctions.length).toBe(board.chains.filter((c) => c.branch).length);
    for (const chain of board.chains.filter((c) => c.branch))
      expect(chain.start).toBeGreaterThan(0);
  });

  it("only runs straight or at 45°, after leaving the pad", () => {
    for (const chain of growCircuit({ ...base, seed: 3 }).chains) {
      for (let i = 2; i < chain.points.length; i++) {
        const dx = chain.points[i].x - chain.points[i - 1].x;
        const dy = chain.points[i].y - chain.points[i - 1].y;
        expect(dx === 0 || dy === 0 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.01).toBe(true);
      }
    }
  });

  it("never lets two traces share a grid node", () => {
    const seen = new Set<string>();
    for (const chain of growCircuit({ ...base, seed: 11 }).chains)
      for (const node of nodesOf(chain).slice(chain.branch ? 0 : 1)) {
        expect(seen.has(node)).toBe(false);
        seen.add(node);
      }
  });

  it("keeps out of blocked areas and stays on the board", () => {
    const board = growCircuit({ ...base, seed: 5 });
    expect(board.chains.length).toBeGreaterThan(20);
    for (const chain of board.chains)
      for (const p of chain.points.slice(1)) {
        expect(base.blocked(p.x, p.y)).toBe(false);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(base.width);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(base.height);
      }
  });

  it("returns an empty board when there is no room", () => {
    expect(growCircuit({ ...base, width: 20, height: 20 }).chains).toEqual([]);
  });
});

describe("helpers", () => {
  it("snaps angles to the nearest heading", () => {
    expect(headingFor(0)).toBe(0);
    expect(headingFor(Math.PI / 2)).toBe(2);
    expect(headingFor(-Math.PI / 4)).toBe(7);
    expect(DIRECTIONS[headingFor(Math.PI)]).toEqual([-1, 0]);
  });

  it("samples the logo ring colours", () => {
    expect(logoColorAt(0)).toBe("#2bc4ff");
    expect(logoColorAt(1)).toBe("#1fa2ff");
    expect(logoColorAt(0.48)).toBe("#ff1f2a");
  });

  it("spaces roots around a ring, heading outward", () => {
    const roots = ringRoots(0, 0, 100, 20);
    expect(roots.length).toBe(Math.round((2 * Math.PI * 100) / 20));
    expect(roots[0]).toMatchObject({ dir: 6 }); // the first root sits at the top, heading up
  });
});
