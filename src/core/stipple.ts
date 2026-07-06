import { Delaunay } from "d3-delaunay";
import { StipplerError } from "../lib/errors";
import { clamp } from "../lib/math";
import { type Rng, uniform } from "../lib/random";

/** Points and their sampled darkness after relaxation and thresholding. */
export interface StippleResult {
  /** Flat [x0, y0, x1, y1, ...] coordinates. */
  readonly points: Float64Array;
  /** Density value at each point, parallel to `points`. */
  readonly darkness: Float64Array;
}

/** First index whose prefix sum exceeds `target`. */
function upperBound(cum: Float64Array, target: number): number {
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((cum[mid] ?? 0) > target) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

/**
 * Weighted sampling of pixel indices without replacement, jittered to
 * sub-pixel positions (port of numpy `rng.choice(p=probs, replace=False)`).
 *
 * Prefix-sum + binary search with redraw on already-taken indices —
 * statistically exact successive weighted sampling without replacement.
 * Returns fewer than `n` seeds when fewer pixels carry positive weight.
 */
export function sampleSeeds(
  density: Float64Array,
  width: number,
  n: number,
  rng: Rng,
): Float64Array {
  const cum = new Float64Array(density.length);
  let running = 0;
  let positive = 0;
  for (let i = 0; i < density.length; i++) {
    const w = density[i] ?? 0;
    if (w > 0) positive++;
    running += w;
    cum[i] = running;
  }
  const total = running;
  const count = Math.min(Math.max(n, 0), positive);

  const taken = new Uint8Array(density.length);
  const indices = new Int32Array(count);
  for (let k = 0; k < count; k++) {
    let idx = -1;
    for (let attempt = 0; attempt < 10_000; attempt++) {
      const candidate = upperBound(cum, rng() * total);
      if (!taken[candidate] && (density[candidate] ?? 0) > 0) {
        idx = candidate;
        break;
      }
    }
    if (idx === -1) {
      // Pathological concentration: fall back to the heaviest untaken pixel.
      let best = -1;
      let bestW = 0;
      for (let i = 0; i < density.length; i++) {
        const w = density[i] ?? 0;
        if (!taken[i] && w > bestW) {
          best = i;
          bestW = w;
        }
      }
      idx = best;
    }
    taken[idx] = 1;
    indices[k] = idx;
  }

  const points = new Float64Array(count * 2);
  for (let k = 0; k < count; k++) {
    const idx = indices[k] ?? 0;
    points[2 * k] = (idx % width) + uniform(rng, -0.5, 0.5);
    points[2 * k + 1] = Math.floor(idx / width) + uniform(rng, -0.5, 0.5);
  }
  return points;
}

/**
 * Lloyd relaxation weighted by density (Secord 2002). Mutates `points`.
 *
 * One Delaunay triangulation is built over the mutable coordinate array;
 * each iteration assigns every positive-density pixel to its nearest point
 * via `find` with a scanline warm start, moves points to their weighted
 * centroids, then retriangulates in place with `update()`.
 */
export function relax(
  points: Float64Array,
  density: Float64Array,
  width: number,
  height: number,
  iters: number,
): void {
  const n = points.length / 2;
  if (n < 3 || iters === 0) return;

  let pixelCount = 0;
  for (const v of density) {
    if (v > 0) pixelCount++;
  }
  const pxX = new Int32Array(pixelCount);
  const pxY = new Int32Array(pixelCount);
  const pxW = new Float64Array(pixelCount);
  let p = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = density[y * width + x] ?? 0;
      if (w > 0) {
        pxX[p] = x;
        pxY[p] = y;
        pxW[p] = w;
        p++;
      }
    }
  }

  const delaunay = new Delaunay(points);
  const wsum = new Float64Array(n);
  const cx = new Float64Array(n);
  const cy = new Float64Array(n);

  for (let iter = 0; iter < iters; iter++) {
    wsum.fill(0);
    cx.fill(0);
    cy.fill(0);
    let owner = 0;
    for (let i = 0; i < pixelCount; i++) {
      const x = pxX[i] ?? 0;
      const y = pxY[i] ?? 0;
      const w = pxW[i] ?? 0;
      owner = delaunay.find(x, y, owner);
      wsum[owner] = (wsum[owner] ?? 0) + w;
      cx[owner] = (cx[owner] ?? 0) + w * x;
      cy[owner] = (cy[owner] ?? 0) + w * y;
    }
    for (let k = 0; k < n; k++) {
      const w = wsum[k] ?? 0;
      if (w > 0) {
        points[2 * k] = (cx[k] ?? 0) / w;
        points[2 * k + 1] = (cy[k] ?? 0) / w;
      }
    }
    // Nudge exact duplicates apart — delaunator drops coincident points.
    for (let k = 1; k < n; k++) {
      if (points[2 * k] === points[2 * k - 2] && points[2 * k + 1] === points[2 * k - 1]) {
        points[2 * k] = (points[2 * k] ?? 0) + 1e-9;
      }
    }
    delaunay.update();
  }
}

/**
 * Sample density at each rounded point position, discarding near-white dots
 * (darkness <= 0.02), and return compacted parallel arrays.
 */
export function sampleDarkness(
  points: Float64Array,
  density: Float64Array,
  width: number,
  height: number,
): StippleResult {
  const n = points.length / 2;
  const keptPts: number[] = [];
  const keptDark: number[] = [];
  for (let k = 0; k < n; k++) {
    const x = points[2 * k] ?? 0;
    const y = points[2 * k + 1] ?? 0;
    const xi = clamp(Math.round(x), 0, width - 1);
    const yi = clamp(Math.round(y), 0, height - 1);
    const dark = density[yi * width + xi] ?? 0;
    if (dark > 0.02) {
      keptPts.push(x, y);
      keptDark.push(dark);
    }
  }
  return { points: Float64Array.from(keptPts), darkness: Float64Array.from(keptDark) };
}

/**
 * Full weighted Voronoi stippling: seed by darkness, relax, threshold.
 * Requesting zero dots yields an empty result.
 *
 * @throws {StipplerError} EMPTY_DENSITY when the density map has no mass.
 */
export function stipple(
  density: Float64Array,
  width: number,
  height: number,
  nDots: number,
  iters: number,
  rng: Rng,
): StippleResult {
  const points = sampleSeeds(density, width, nDots, rng);
  if (nDots > 0 && points.length === 0) {
    throw new StipplerError("EMPTY_DENSITY", "density map is empty — image may be blank");
  }
  relax(points, density, width, height, iters);
  return sampleDarkness(points, density, width, height);
}
