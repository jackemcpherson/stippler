import { describe, expect, it } from "vitest";
import { relax, sampleSeeds, stipple } from "../../src/core/stipple";
import { StipplerError } from "../../src/lib/errors";
import { createRng } from "../../src/lib/random";

const W = 120;
const H = 120;

function uniformDisk(): Float64Array {
  const d = new Float64Array(W * H);
  const cx = W / 2;
  const cy = H / 2;
  const r = W * 0.4;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) d[y * W + x] = 1;
    }
  }
  return d;
}

function halfAndHalf(): Float64Array {
  const d = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      d[y * W + x] = x < W / 2 ? 1.0 : 0.1;
    }
  }
  return d;
}

function meanNearestNeighbourDistance(points: Float64Array): number {
  const n = points.length / 2;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let best = Number.POSITIVE_INFINITY;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dx = (points[2 * i] ?? 0) - (points[2 * j] ?? 0);
      const dy = (points[2 * i + 1] ?? 0) - (points[2 * j + 1] ?? 0);
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    sum += Math.sqrt(best);
  }
  return sum / n;
}

describe("stipple", () => {
  it("is deterministic for a fixed seed", () => {
    const d = uniformDisk();
    const a = stipple(d, W, H, 300, 10, createRng(7));
    const b = stipple(d, W, H, 300, 10, createRng(7));
    expect(Array.from(a.points)).toEqual(Array.from(b.points));
    expect(Array.from(a.darkness)).toEqual(Array.from(b.darkness));
  });

  it("differs across seeds", () => {
    const d = uniformDisk();
    const a = stipple(d, W, H, 300, 5, createRng(7));
    const b = stipple(d, W, H, 300, 5, createRng(8));
    expect(Array.from(a.points)).not.toEqual(Array.from(b.points));
  });

  it("keeps all points inside the canvas", () => {
    const result = stipple(uniformDisk(), W, H, 400, 15, createRng(7));
    for (let i = 0; i < result.points.length / 2; i++) {
      expect(result.points[2 * i]).toBeGreaterThanOrEqual(0);
      expect(result.points[2 * i]).toBeLessThan(W);
      expect(result.points[2 * i + 1]).toBeGreaterThanOrEqual(0);
      expect(result.points[2 * i + 1]).toBeLessThan(H);
    }
  });

  it("follows density: dense side gets many more dots", () => {
    const result = stipple(halfAndHalf(), W, H, 500, 20, createRng(7));
    let left = 0;
    let right = 0;
    for (let i = 0; i < result.points.length / 2; i++) {
      if ((result.points[2 * i] ?? 0) < W / 2) left++;
      else right++;
    }
    expect(left / Math.max(1, right)).toBeGreaterThan(2);
  });

  it("produces no NaN with isolated single-pixel densities", () => {
    const d = new Float64Array(W * H);
    d[10 * W + 10] = 1;
    d[50 * W + 90] = 1;
    d[100 * W + 40] = 1;
    d[70 * W + 20] = 1;
    const result = stipple(d, W, H, 4, 10, createRng(7));
    for (const v of result.points) expect(Number.isNaN(v)).toBe(false);
  });

  it("throws EMPTY_DENSITY on an all-zero map", () => {
    expect(() => stipple(new Float64Array(W * H), W, H, 100, 5, createRng(7))).toThrowError(
      StipplerError,
    );
  });

  it("degrades gracefully when positive pixels are fewer than requested dots", () => {
    const d = new Float64Array(W * H);
    for (let i = 0; i < 10; i++) d[40 * W + 40 + i] = 1;
    const result = stipple(d, W, H, 100, 5, createRng(7));
    expect(result.points.length / 2).toBeLessThanOrEqual(10);
    expect(result.points.length / 2).toBeGreaterThan(0);
  });
});

describe("relax", () => {
  it("improves blue-noise spacing on a uniform disk", () => {
    const d = uniformDisk();
    const before = sampleSeeds(d, W, 200, createRng(7));
    const after = Float64Array.from(before);
    relax(after, d, W, H, 30);
    const spacingBefore = meanNearestNeighbourDistance(before);
    const spacingAfter = meanNearestNeighbourDistance(after);
    expect(spacingAfter).toBeGreaterThan(spacingBefore * 1.5);
  });
});

describe("sampleSeeds", () => {
  it("matches weighted proportions without replacement", () => {
    // Tile three weights across a large strip and check empirical frequency.
    const width = 300;
    const height = 100;
    const weights = [0.6, 0.3, 0.1] as const;
    const d = new Float64Array(width * height);
    for (let i = 0; i < d.length; i++) d[i] = weights[i % 3] ?? 0;
    const n = 5000;
    const pts = sampleSeeds(d, width, n, createRng(7));
    const counts = [0, 0, 0];
    const seen = new Set<number>();
    for (let k = 0; k < n; k++) {
      const x = Math.round(pts[2 * k] ?? 0);
      const y = Math.round(pts[2 * k + 1] ?? 0);
      const idx =
        Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x));
      expect(seen.has(idx)).toBe(false);
      seen.add(idx);
      counts[idx % 3] = (counts[idx % 3] ?? 0) + 1;
    }
    expect(counts[0] / n).toBeCloseTo(0.6, 1);
    expect(counts[1] / n).toBeCloseTo(0.3, 1);
    expect((counts[2] ?? 0) / n).toBeLessThan(0.13);
  });
});
