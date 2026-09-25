// Seeded randomness so every generator is reproducible from a seed.

/** mulberry32: a small, fast 32-bit PRNG returning floats in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;

/** Integer in [lo, hi], both inclusive. */
export const randInt = (rand: Rand, lo: number, hi: number) =>
  lo + Math.floor(rand() * (hi - lo + 1));
export const pick = <T>(rand: Rand, items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)];
