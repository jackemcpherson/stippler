import { describe, expect, it } from "vitest";
import { createRng, uniform } from "../../src/lib/random";

describe("createRng", () => {
  it("produces identical sequences for the same seed", () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 1000; i++) {
      expect(a()).toBe(b());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(7);
    const b = createRng(8);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("stays within [0, 1)", () => {
    const rng = createRng(42);
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("matches the frozen seed-7 prefix", () => {
    const rng = createRng(7);
    const prefix = Array.from({ length: 5 }, () => rng());
    expect(prefix).toMatchSnapshot();
  });

  it("has mean near 0.5 over many draws", () => {
    const rng = createRng(1);
    let sum = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      sum += rng();
    }
    expect(sum / n).toBeCloseTo(0.5, 2);
  });
});

describe("uniform", () => {
  it("maps into [lo, hi)", () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const v = uniform(rng, -0.5, 0.5);
      expect(v).toBeGreaterThanOrEqual(-0.5);
      expect(v).toBeLessThan(0.5);
    }
  });
});
