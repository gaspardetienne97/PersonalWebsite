/**
 * Grows circuit boards: space colonisation, snapped to a PCB grid.
 *
 * Random "attractor" points are scattered over the free parts of the board. Each
 * round, every attractor pulls on the nearest piece of circuit within reach; a node
 * that feels a pull grows one grid step toward the average of its attractors, and
 * attractors that get reached disappear. Because any node (not only a tip) can be
 * the nearest, older traces sprout side branches, which gives T-junctions and fills
 * the board evenly instead of shooting straight lines outward.
 *
 * The PCB part: moves are restricted to the eight octilinear headings, a trace
 * keeps its heading until the pull drifts more than about 50° away (so runs stay
 * long and straight rather than zigzagging), it never turns back on itself, two
 * traces never share a node, and two diagonals never cross.
 *
 * Everything comes from a seeded generator, so a seed always grows the same board:
 * server and browser agree, and tests can pin the result.
 */

export type Point = { x: number; y: number };

/** Where a trace leaves a component: an exact pad position and an outward heading. */
export type Root = {
  x: number;
  y: number;
  /** Heading 0 to 7: 0 is east, then clockwise in screen space (y grows downward). */
  dir: number;
  color?: string;
};

/** One unbranched run of trace, drawn as a single path. */
export type Chain = {
  /** Start point, every bend, then the end point. */
  points: Point[];
  /** Grid steps from the root to where this chain starts, for timing a grow animation. */
  start: number;
  /** Grid steps along this chain. */
  steps: number;
  /** True when the chain leaves another trace at a junction. */
  branch: boolean;
  color?: string;
};

export type Board = {
  width: number;
  height: number;
  chains: Chain[];
  /** Where a side branch leaves another trace. */
  junctions: Point[];
  /** Free ends, drawn as vias. */
  ends: Point[];
  /** Longest root-to-end distance in grid steps. */
  depth: number;
};

export type GrowOptions = {
  width: number;
  height: number;
  /** Grid spacing in pixels. Nodes sit at the centre of each pitch-sized cell. */
  pitch: number;
  roots: Root[];
  seed?: number;
  /** Pixel test for keep-out areas (logo, text, components). */
  blocked?: (x: number, y: number) => boolean;
  /** Attractors per free grid node. Higher fills the board more densely. */
  density?: number;
  /** How far an attractor reaches, in grid steps. */
  reach?: number;
  /** Nodes kept free along the board edge. */
  margin?: number;
  /** Straight steps every root takes before colonisation, as a [min, max] range. */
  fanOut?: [number, number];
  /** A fresh trace keeps going straight, pulled or not, until it is this many steps long. */
  minRun?: number;
  /** Side branches whose longest path is shorter than this are dropped. */
  minBranch?: number;
  /** Pads whose whole tree is shorter than this are dropped. */
  minRoot?: number;
};

/** Unit steps for the eight headings, clockwise from east. */
export const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

const wrap = (dir: number) => ((dir % 8) + 8) % 8;
/** Smallest number of 45° turns between two headings (0 to 4). */
const turns = (a: number, b: number) => Math.min(wrap(a - b), wrap(b - a));

/** Seeded generator returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash for turning a slug into a seed. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Nearest of the eight headings to an angle in radians (screen space). */
export function headingFor(angle: number): number {
  return wrap(Math.round(angle / (Math.PI / 4)));
}

export function growCircuit(options: GrowOptions): Board {
  const {
    width,
    height,
    pitch,
    roots,
    seed = 1,
    blocked,
    density = 1 / 12,
    reach = 7,
    margin = 1,
    fanOut = [2, 6],
    minRun = 6,
    minBranch = 6,
    minRoot = 8,
  } = options;

  const cols = Math.floor(width / pitch);
  const rows = Math.floor(height / pitch);
  const empty: Board = { width, height, chains: [], junctions: [], ends: [], depth: 0 };
  if (cols < 3 || rows < 3) return empty;

  const rand = mulberry32(seed);
  const px = (g: number) => g * pitch + pitch / 2;
  const cell = (gx: number, gy: number) => gy * cols + gx;
  const inside = (gx: number, gy: number) =>
    gx >= margin && gy >= margin && gx < cols - margin && gy < rows - margin;

  // Grid: 0 free, 1 trace, 2 keep-out. `owner` maps a cell to the node on it.
  const grid = new Uint8Array(cols * rows);
  const owner = new Int32Array(cols * rows).fill(-1);
  let freeCells = 0;
  for (let gy = 0; gy < rows; gy++)
    for (let gx = 0; gx < cols; gx++) {
      if (!inside(gx, gy) || blocked?.(px(gx), px(gy))) grid[cell(gx, gy)] = 2;
      else freeCells++;
    }
  // Diagonal moves are keyed by the cell corner they pass through, so two can't cross.
  const corners = new Set<number>();
  const cornerKey = (gx: number, gy: number, dx: number, dy: number) =>
    (2 * gy + dy + 2) * (2 * cols + 4) + (2 * gx + dx + 2);
  const free = (gx: number, gy: number) => inside(gx, gy) && grid[cell(gx, gy)] === 0;

  // Nodes, stored as parallel arrays.
  const nx: number[] = [];
  const ny: number[] = [];
  const parent: number[] = [];
  const heading: number[] = [];
  const depth: number[] = [];
  const kids: number[][] = [];
  const tint: (string | undefined)[] = [];
  const pads: (Point | null)[] = [];
  const maxKids: number[] = [];
  /** Steps since the trace this node is on started (at a pad or a junction). */
  const run: number[] = [];

  const addNode = (gx: number, gy: number, from: number, dir: number, color?: string) => {
    const id = nx.length;
    nx.push(gx);
    ny.push(gy);
    parent.push(from);
    heading.push(dir);
    depth.push(from < 0 ? 0 : depth[from] + 1);
    kids.push([]);
    tint.push(color);
    pads.push(null);
    maxKids.push(from < 0 ? 1 : 2);
    run.push(from < 0 ? 0 : kids[from].length > 0 ? 1 : run[from] + 1);
    grid[cell(gx, gy)] = 1;
    owner[cell(gx, gy)] = id;
    if (from >= 0) kids[from].push(id);
    return id;
  };

  for (const root of roots) {
    const dir = wrap(root.dir);
    const [dx, dy] = DIRECTIONS[dir];
    // Step out from the pad to the first free node along its heading.
    let gx = Math.round((root.x - pitch / 2) / pitch);
    let gy = Math.round((root.y - pitch / 2) / pitch);
    for (let tries = 0; !free(gx, gy) && tries < 4; tries++) {
      gx += dx;
      gy += dy;
    }
    if (!free(gx, gy)) continue;
    const id = addNode(gx, gy, -1, dir, root.color);
    pads[id] = { x: root.x, y: root.y };
  }

  const canMove = (id: number, dir: number) => {
    const [dx, dy] = DIRECTIONS[dir];
    if (!free(nx[id] + dx, ny[id] + dy)) return false;
    return dx === 0 || dy === 0 || !corners.has(cornerKey(nx[id], ny[id], dx, dy));
  };
  const grow = (id: number, dir: number) => {
    const [dx, dy] = DIRECTIONS[dir];
    if (dx !== 0 && dy !== 0) corners.add(cornerKey(nx[id], ny[id], dx, dy));
    return addNode(nx[id] + dx, ny[id] + dy, id, dir, tint[id]);
  };

  // Fan out: every root runs straight for a few steps first, the way traces leave
  // a chip, so neighbouring pads don't starve each other.
  const tips = nx.map((_, id) => id);
  const lengths = tips.map(() => fanOut[0] + Math.floor(rand() * (fanOut[1] - fanOut[0] + 1)));
  for (let step = 0; step < fanOut[1]; step++)
    for (let i = 0; i < tips.length; i++) {
      if (step >= lengths[i] || tips[i] < 0) continue;
      const dir = heading[tips[i]];
      tips[i] = canMove(tips[i], dir) ? grow(tips[i], dir) : -1;
    }

  // Scatter attractors over free cells (positions in grid units).
  const count = Math.round(freeCells * density);
  const ax: number[] = [];
  const ay: number[] = [];
  for (let tries = 0; ax.length < count && tries < count * 6; tries++) {
    const x = rand() * cols - 0.5;
    const y = rand() * rows - 0.5;
    const gx = Math.round(x);
    const gy = Math.round(y);
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows || grid[cell(gx, gy)] === 2) continue;
    ax.push(x);
    ay.push(y);
  }
  const alive = new Uint8Array(ax.length).fill(1);

  const R = Math.ceil(reach);
  const kill = 1.25;
  for (let round = 0; round < cols + rows; round++) {
    // Each living attractor pulls on its nearest node that can still grow.
    const pullX = new Map<number, number>();
    const pullY = new Map<number, number>();
    for (let a = 0; a < ax.length; a++) {
      if (!alive[a]) continue;
      const cx = Math.round(ax[a]);
      const cy = Math.round(ay[a]);
      let best = -1;
      let bestD = reach * reach;
      for (let gy = Math.max(0, cy - R); gy <= Math.min(rows - 1, cy + R); gy++)
        for (let gx = Math.max(0, cx - R); gx <= Math.min(cols - 1, cx + R); gx++) {
          const id = owner[cell(gx, gy)];
          if (id < 0) continue;
          const d = (gx - ax[a]) ** 2 + (gy - ay[a]) ** 2;
          if (d < kill * kill) {
            alive[a] = 0;
            best = -1;
            gy = rows; // reached: this attractor is done
            break;
          }
          if (d < bestD && kids[id].length < maxKids[id]) {
            bestD = d;
            best = id;
          }
        }
      if (best < 0) continue;
      const len = Math.sqrt(bestD);
      pullX.set(best, (pullX.get(best) ?? 0) + (ax[a] - nx[best]) / len);
      pullY.set(best, (pullY.get(best) ?? 0) + (ay[a] - ny[best]) / len);
    }

    let grew = 0;
    for (const [id, vx] of pullX) {
      const vy = pullY.get(id) ?? 0;
      if (vx === 0 && vy === 0) continue;
      const want = Math.atan2(vy, vx);
      const ideal = headingFor(want);
      const from = heading[id];
      const taken = kids[id].map((k) => heading[k]);
      // Keep going straight while the pull stays within ~50° of the current heading.
      const off = Math.abs(((want - (from * Math.PI) / 4 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      const order =
        kids[id].length === 0 && off < (50 * Math.PI) / 180
          ? [from, ideal, wrap(ideal + 1), wrap(ideal - 1)]
          : [ideal, wrap(ideal + 1), wrap(ideal - 1)];
      for (const dir of order) {
        // Never turn more than 90° off the incoming heading, never double up a branch.
        if (turns(dir, from) > 2 || taken.includes(dir)) continue;
        if (kids[id].length > 0 && turns(dir, from) === 0) continue;
        if (!canMove(id, dir)) continue;
        grow(id, dir);
        grew++;
        break;
      }
    }

    // Momentum: a young trace that nothing pulls keeps going (straight if it can),
    // so the board isn't littered with stubs.
    for (let id = 0, n = nx.length; id < n; id++) {
      if (kids[id].length > 0 || run[id] >= minRun || pullX.has(id)) continue;
      const dir = [heading[id], wrap(heading[id] + 1), wrap(heading[id] - 1)].find((d) =>
        canMove(id, d),
      );
      if (dir === undefined) continue;
      grow(id, dir);
      grew++;
    }
    if (grew === 0) break;
  }

  // Longest path below each node (children always come after their parent).
  const reachBelow = Array.from<number>({ length: nx.length }).fill(0);
  for (let id = nx.length - 1; id >= 0; id--)
    if (parent[id] >= 0)
      reachBelow[parent[id]] = Math.max(reachBelow[parent[id]], reachBelow[id] + 1);

  // Turn the tree into chains: a chain follows the straightest child; every other
  // child starts a new chain at a junction.
  const board: Board = { ...empty };
  const walk = (start: number, from: Point | null, startDepth: number, branch: boolean) => {
    const points: Point[] = [];
    if (from) points.push(from);
    let id = start;
    let steps = from ? 1 : 0;
    let dir = -1;
    points.push({ x: px(nx[id]), y: px(ny[id]) });
    for (;;) {
      const next = [...kids[id]].sort(
        (a, b) => turns(heading[a], heading[id]) - turns(heading[b], heading[id]),
      );
      if (next.length === 0) break;
      for (const side of next.slice(1))
        if (reachBelow[side] + 1 >= minBranch)
          walk(side, { x: px(nx[id]), y: px(ny[id]) }, depth[id], true);
      const child = next[0];
      if (heading[child] !== dir && dir !== -1) points.push({ x: px(nx[id]), y: px(ny[id]) });
      dir = heading[child];
      id = child;
      steps++;
    }
    points.push({ x: px(nx[id]), y: px(ny[id]) });
    const clean = points.filter(
      (p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
    );
    if (clean.length < 2) return;
    if (branch) board.junctions.push(clean[0]);
    board.chains.push({ points: clean, start: startDepth, steps, branch, color: tint[start] });
    board.ends.push(clean[clean.length - 1]);
    board.depth = Math.max(board.depth, startDepth + steps);
  };
  // Short branches and short pads read as noise rather than circuitry: leave them out.
  for (let id = 0; id < nx.length; id++)
    if (parent[id] < 0 && reachBelow[id] + 1 >= minRoot) walk(id, pads[id], 0, false);
  return board;
}

export function toPathData(points: Point[]): string {
  return points
    .map(
      (p, i) => `${i === 0 ? "M" : "L"}${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`,
    )
    .join(" ");
}

/**
 * Colour along the logo's ring, sampled top (0) to bottom (1). The ring runs
 * cyan at the top, through magenta, to red at the bars, then pink and blue.
 */
export const LOGO_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0, "#2bc4ff"],
  [0.22, "#c531f2"],
  [0.48, "#ff1f2a"],
  [0.68, "#ff6fa6"],
  [0.85, "#a98bff"],
  [1, "#1fa2ff"],
];

/** Marker colours from the drawings. */
export const MARKERS = {
  red: "#e8452c",
  blue: "#4f6ff5",
  green: "#2e8b4a",
  violet: "#a35be0",
  yellow: "#f2b705",
} as const;

export function logoColorAt(t: number): string {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < LOGO_STOPS.length; i++) {
    const [p1, c1] = LOGO_STOPS[i];
    const [p0, c0] = LOGO_STOPS[i - 1];
    if (x <= p1) return mix(c0, c1, (x - p0) / (p1 - p0));
  }
  return LOGO_STOPS[LOGO_STOPS.length - 1][1];
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/**
 * Roots spaced around a ring, heading straight out (or in, with `inward`), coloured
 * like the logo where they leave it with the odd marker colour from the drawings.
 */
export function ringRoots(
  cx: number,
  cy: number,
  radius: number,
  spacing: number,
  inward = false,
): Root[] {
  const count = Math.max(12, Math.round((2 * Math.PI * radius) / spacing));
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const color =
      i % 9 === 4
        ? MARKERS.yellow
        : i % 13 === 7
          ? MARKERS.green
          : logoColorAt((Math.sin(angle) + 1) / 2);
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      dir: headingFor(inward ? angle + Math.PI : angle),
      color,
    };
  });
}
