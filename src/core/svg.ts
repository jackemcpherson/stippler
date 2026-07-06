/**
 * Encode stipple dots as a few round-cap stroke paths, bucketed by radius.
 *
 * One `h.01` micro-segment per dot is ~3x smaller than a `<circle>` element,
 * and bucketing radii into 6 classes keeps the file to a handful of paths.
 */

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

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img">`,
  ];
  for (let b = 0; b < BUCKETS; b++) {
    let sum = 0;
    let count = 0;
    let d = "";
    for (let i = 0; i < n; i++) {
      const r = radii[i] ?? 0;
      const bucket = Math.min(
        BUCKETS - 1,
        Math.max(0, Math.floor(((r - min) / (spread + 1e-9)) * BUCKETS)),
      );
      if (bucket !== b) continue;
      sum += r;
      count++;
      d += `M${(points[2 * i] ?? 0).toFixed(1)} ${(points[2 * i + 1] ?? 0).toFixed(1)}h.01`;
    }
    if (count === 0) continue;
    const strokeWidth = ((2 * sum) / count).toFixed(2);
    parts.push(
      `<path stroke="${ink}" stroke-width="${strokeWidth}" stroke-linecap="round" fill="none" d="${d}"/>`,
    );
  }
  parts.push("</svg>");
  return parts.join("\n");
}
