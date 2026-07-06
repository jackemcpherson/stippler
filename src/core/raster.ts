/** Pure raster helpers shared by the cropping, framing, and padding stages. */

import type { CropBox, RgbImage } from "../types";

/** Fractional crop with Python `int()` truncation of pixel bounds. */
export function cropFractional(im: RgbImage, box: CropBox): RgbImage {
  const x0 = Math.trunc(box.x0 * im.width);
  const y0 = Math.trunc(box.y0 * im.height);
  const x1 = Math.trunc(box.x1 * im.width);
  const y1 = Math.trunc(box.y1 * im.height);
  const w = x1 - x0;
  const h = y1 - y0;
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const srcStart = 3 * ((y + y0) * im.width + x0);
    out.set(im.data.subarray(srcStart, srcStart + w * 3), 3 * y * w);
  }
  return { data: out, width: w, height: h };
}

/**
 * Copy interleaved pixels onto a white canvas with the source's top-left at
 * (left, top), clipping rows/columns that fall outside the destination.
 *
 * Pure clipped row-copy: sharp's composite rejects negative offsets, which
 * head frames routinely produce.
 */
export function pasteOnWhite(
  src: Uint8Array,
  channels: number,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  left: number,
  top: number,
): Uint8Array {
  const out = new Uint8Array(dstW * dstH * channels).fill(255);
  for (let y = 0; y < srcH; y++) {
    const dy = y + top;
    if (dy < 0 || dy >= dstH) continue;
    for (let x = 0; x < srcW; x++) {
      const dx = x + left;
      if (dx < 0 || dx >= dstW) continue;
      const si = channels * (y * srcW + x);
      const di = channels * (dy * dstW + dx);
      for (let c = 0; c < channels; c++) {
        out[di + c] = src[si + c] ?? 255;
      }
    }
  }
  return out;
}
