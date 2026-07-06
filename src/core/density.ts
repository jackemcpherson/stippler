import { clamp } from "../lib/math";
import type { GrayImage, RgbImage } from "../types";
import { pasteOnWhite } from "./raster";

/**
 * Convert interleaved RGB to single-channel luminance.
 *
 * Uses PIL's exact Rec.601 integer luma (`convert("L")`) rather than sharp's
 * `greyscale()`, which applies a different transform.
 */
export function grayscaleFromRgb(rgb: RgbImage): GrayImage {
  const n = rgb.width * rgb.height;
  const out = new Uint8Array(n);
  const src = rgb.data;
  for (let i = 0; i < n; i++) {
    const r = src[3 * i] ?? 0;
    const g = src[3 * i + 1] ?? 0;
    const b = src[3 * i + 2] ?? 0;
    out[i] = (r * 19595 + g * 38470 + b * 7471 + 0x8000) >> 16;
  }
  return { data: out, width: rgb.width, height: rgb.height };
}

/** Remove `cut` histogram mass starting at `start`, walking by `step`. */
function trimHistogramEnd(hist: number[], cut: number, start: number, step: number): void {
  for (let i = start; i >= 0 && i < 256 && cut > 0; i += step) {
    const h = hist[i] ?? 0;
    if (cut > h) {
      cut -= h;
      hist[i] = 0;
    } else {
      hist[i] = h - cut;
      cut = 0;
    }
  }
}

/**
 * Port of PIL `ImageOps.autocontrast(cutoff)`.
 *
 * Removes `cutoff` percent of histogram mass from each end (partially
 * reducing boundary bins, as PIL does), then remaps the surviving [lo, hi]
 * range onto [0, 255] with truncating integer math.
 */
export function autocontrast(im: GrayImage, cutoffPercent: number): GrayImage {
  const hist = new Array<number>(256).fill(0);
  for (const v of im.data) {
    hist[v] = (hist[v] ?? 0) + 1;
  }
  const cut = Math.trunc((im.data.length * cutoffPercent) / 100);
  trimHistogramEnd(hist, cut, 0, 1);
  trimHistogramEnd(hist, cut, 255, -1);

  let lo = 0;
  while (lo < 256 && (hist[lo] ?? 0) === 0) lo++;
  let hi = 255;
  while (hi >= 0 && (hist[hi] ?? 0) === 0) hi--;
  if (hi <= lo) {
    return { data: new Uint8Array(im.data), width: im.width, height: im.height };
  }

  const scale = 255 / (hi - lo);
  const offset = -lo * scale;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = clamp(Math.trunc(i * scale + offset), 0, 255);
  }
  const out = new Uint8Array(im.data.length);
  for (let i = 0; i < im.data.length; i++) {
    out[i] = lut[im.data[i] ?? 0] ?? 0;
  }
  return { data: out, width: im.width, height: im.height };
}

/** Placement of a source image scaled to fit inside a destination canvas. */
export interface Placement {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
}

/**
 * Port of PIL `ImageOps.pad(size, centering=(0.5, 0.35))` placement math:
 * scale to fit, then bias the vertical position toward the top.
 */
export function containPlacement(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  centeringX = 0.5,
  centeringY = 0.35,
): Placement {
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const width = Math.round(srcW * scale);
  const height = Math.round(srcH * scale);
  const left = Math.round((dstW - width) * centeringX);
  const top = Math.round((dstH - height) * centeringY);
  return { width, height, left, top };
}

/** Paste a grayscale image onto a white destination canvas at a placement. */
export function pasteGrayOnWhite(
  src: GrayImage,
  dstW: number,
  dstH: number,
  left: number,
  top: number,
): GrayImage {
  const out = pasteOnWhite(src.data, 1, src.width, src.height, dstW, dstH, left, top);
  return { data: out, width: dstW, height: dstH };
}

/**
 * Darkness-driven stipple density in [0, 1], vignetted to an oval bust.
 *
 * `gray` and `edge` must both be the full working canvas. Constants match
 * stipple.py exactly (oval centred at (0.5, 0.46), soft falloff over 0.14).
 */
export function buildDensity(
  gray: GrayImage,
  edge: GrayImage,
  gamma: number,
  edgeBoost: number,
): Float64Array {
  const { width: w, height: h } = gray;
  const d = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const ey = (y / h - 0.46) / 0.52;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const lum = (gray.data[i] ?? 255) / 255;
      const dark = (1 - lum) ** gamma;
      const e = (edge.data[i] ?? 0) / 255;
      let v = clamp(dark + edgeBoost * e, 0, 1);

      const ex = (x / w - 0.5) / 0.5;
      const r = Math.sqrt(ex * ex + ey * ey);
      const vignette = clamp((1.14 - r) / 0.14, 0, 1);
      v *= vignette;
      d[i] = v < 0.01 ? 0 : v;
    }
  }
  return d;
}
