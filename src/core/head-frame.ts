import type { Frame, RgbImage } from "../types";

/** numpy-style linear-interpolation percentile over a copy of `values`. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 1) return sorted[0] ?? 0;
  const pos = (p / 100) * (n - 1);
  const lo = Math.floor(pos);
  const loVal = sorted[lo] ?? 0;
  const hiVal = sorted[Math.min(lo + 1, n - 1)] ?? loVal;
  return loVal + (pos - lo) * (hiVal - loVal);
}

/**
 * Head-normalised frame from a foreground matte (port of cutout.py).
 *
 * Measures head width in the top 20% of the subject and frames so every
 * portrait has the crown at the same height and the head at the same scale.
 * The frame may extend past the matte bounds (negative left/top); paste
 * handles clipping. Uses `Math.trunc` wherever Python used `int()` — the
 * top offset goes negative and Python truncates toward zero.
 */
export function computeHeadFrame(matte: Float64Array, width: number, height: number): Frame {
  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    let any = false;
    for (let x = 0; x < width; x++) {
      if ((matte[y * width + x] ?? 0) > 0.6) {
        any = true;
        break;
      }
    }
    if (any) {
      if (y0 === -1) y0 = y;
      y1 = y;
    }
  }
  if (y0 === -1) {
    return { left: 0, top: 0, width, height };
  }

  const zoneRows = Math.max(1, Math.trunc(0.2 * (y1 - y0)));
  const widths: number[] = [];
  let xSum = 0;
  let solidCount = 0;
  for (let y = y0; y < Math.min(height, y0 + zoneRows); y++) {
    let rowCount = 0;
    for (let x = 0; x < width; x++) {
      if ((matte[y * width + x] ?? 0) > 0.6) {
        rowCount++;
        xSum += x;
        solidCount++;
      }
    }
    widths.push(rowCount);
  }

  const headW = Math.trunc(percentile(widths, 80));
  const cx = solidCount > 0 ? Math.trunc(xSum / solidCount) : Math.trunc(width / 2);
  const size = Math.trunc(1.75 * headW);
  const left = cx - Math.floor(size / 2);
  const top = Math.trunc(y0 - 0.1 * size);
  return { left, top, width: size, height: Math.trunc(1.2 * size) };
}

/**
 * Composite an image onto white using a matte: `out = rgb*m + 255*(1-m)`.
 *
 * Truncates like numpy's `astype(uint8)`. Replaces the Python pipeline's
 * JPEG round-trip through cutouts/ — raw pixels flow straight through.
 */
export function compositeOnWhite(rgb: RgbImage, matte: Float64Array): RgbImage {
  const n = rgb.width * rgb.height;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const m = matte[i] ?? 0;
    for (let c = 0; c < 3; c++) {
      out[3 * i + c] = Math.trunc((rgb.data[3 * i + c] ?? 0) * m + 255 * (1 - m));
    }
  }
  return { data: out, width: rgb.width, height: rgb.height };
}

/**
 * Copy `src` into a white canvas of the frame's size, positioned so that
 * source pixel (frame.left, frame.top) lands at the canvas origin.
 *
 * Pure clipped row-copy: sharp's composite rejects negative offsets, which
 * head frames routinely produce.
 */
export function pasteRgbOnWhite(src: RgbImage, frame: Frame): RgbImage {
  const out = new Uint8Array(frame.width * frame.height * 3).fill(255);
  for (let y = 0; y < frame.height; y++) {
    const sy = y + frame.top;
    if (sy < 0 || sy >= src.height) continue;
    for (let x = 0; x < frame.width; x++) {
      const sx = x + frame.left;
      if (sx < 0 || sx >= src.width) continue;
      const si = 3 * (sy * src.width + sx);
      const di = 3 * (y * frame.width + x);
      out[di] = src.data[si] ?? 255;
      out[di + 1] = src.data[si + 1] ?? 255;
      out[di + 2] = src.data[si + 2] ?? 255;
    }
  }
  return { data: out, width: frame.width, height: frame.height };
}
