/**
 * Encode stipple dots as a few round-cap stroke paths, bucketed by radius.
 *
 * One `h.01` micro-segment per dot is ~3x smaller than a `<circle>` element,
 * and bucketing radii into 6 classes keeps the file to a handful of paths.
 */

import { clamp } from "../lib/math";

const BUCKETS = 6;

/** Dot radius from darkness: 0.5 + 1.55 * dark^0.85 (range 0.5–2.05). */
function radius(dark: number): number {
  return 0.5 + 1.55 * dark ** 0.85;
}

/** Render a complete SVG document from relaxed points and their darkness. */
export function renderSvg(
  points: Float64Array,
  darkness: Float64Array,
  ink: string,
  width: number,
  height: number,
): string {
  const n = darkness.length;
  const radii = new Float64Array(n);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const r = radius(darkness[i] ?? 0);
    radii[i] = r;
    if (r < min) min = r;
    if (r > max) max = r;
  }
  const spread = max - min;

  const ds = new Array<string>(BUCKETS).fill("");
  const sums = new Float64Array(BUCKETS);
  const counts = new Uint32Array(BUCKETS);
  for (let i = 0; i < n; i++) {
    const r = radii[i] ?? 0;
    const b = clamp(Math.floor(((r - min) / (spread + 1e-9)) * BUCKETS), 0, BUCKETS - 1);
    sums[b] = (sums[b] ?? 0) + r;
    counts[b] = (counts[b] ?? 0) + 1;
    ds[b] += `M${(points[2 * i] ?? 0).toFixed(1)} ${(points[2 * i + 1] ?? 0).toFixed(1)}h.01`;
  }

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img">`,
  ];
  for (let b = 0; b < BUCKETS; b++) {
    const count = counts[b] ?? 0;
    if (count === 0) continue;
    const strokeWidth = ((2 * (sums[b] ?? 0)) / count).toFixed(2);
    parts.push(
      `<path stroke="${ink}" stroke-width="${strokeWidth}" stroke-linecap="round" fill="none" d="${ds[b]}"/>`,
    );
  }
  parts.push("</svg>");
  return parts.join("\n");
}
