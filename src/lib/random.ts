/** Deterministic PRNG returning floats in [0, 1). */
export type Rng = () => number;

/**
 * Create a seeded mulberry32 generator.
 *
 * Integer math (`imul`, shifts) is exact across platforms, so the same seed
 * yields the same sequence everywhere. Not bit-compatible with numpy's PCG64
 * used by the original Python pipeline.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform draw in [lo, hi). */
export function uniform(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}
