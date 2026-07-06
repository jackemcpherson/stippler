import sharp from "sharp";
import { StipplerError } from "../lib/errors";
import type { CropBox, GrayImage, RgbImage } from "../types";

/**
 * Decode any sharp-supported image to raw interleaved RGB.
 *
 * Applies EXIF orientation (`rotate()` with no args) — a deliberate upgrade
 * over the Python pipeline so phone photos come out upright.
 */
export async function decodeToRgb(buffer: Buffer): Promise<RgbImage> {
  try {
    const { data, info } = await sharp(buffer)
      .rotate()
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 3) {
      throw new Error(`expected 3 channels, got ${info.channels}`);
    }
    return { data: new Uint8Array(data), width: info.width, height: info.height };
  } catch (cause) {
    throw new StipplerError("UNSUPPORTED_IMAGE", "could not decode input image", { cause });
  }
}

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
 * Resize a grayscale image with `fit: "fill"` (PIL `resize` semantics —
 * exact target dimensions, no aspect preservation) and lanczos3.
 */
export async function resizeGray(im: GrayImage, width: number, height: number): Promise<GrayImage> {
  // sharp expands single-channel raw input to 3 channels when resizing;
  // extractChannel(0) forces the output back to one channel.
  const { data, info } = await sharp(im.data, {
    raw: { width: im.width, height: im.height, channels: 1 },
  })
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) {
    throw new StipplerError("UNSUPPORTED_IMAGE", "grayscale resize returned multi-channel data");
  }
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

/** Resize an RGB image with `fit: "fill"` and lanczos3. */
export async function resizeRgb(im: RgbImage, width: number, height: number): Promise<RgbImage> {
  const { data, info } = await sharp(im.data, {
    raw: { width: im.width, height: im.height, channels: 3 },
  })
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

/**
 * Port of PIL `FIND_EDGES` followed by `GaussianBlur(1)`.
 *
 * The 3x3 Laplacian kernel sums to zero, so `scale: 1` must be explicit —
 * sharp's default scale is the kernel sum. uint8 output clamps negatives to
 * zero exactly like PIL's "L" mode.
 */
export async function edgeMap(gray: GrayImage): Promise<GrayImage> {
  const { data, info } = await sharp(gray.data, {
    raw: { width: gray.width, height: gray.height, channels: 1 },
  })
    .convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
      scale: 1,
      offset: 0,
    })
    .blur(1)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) {
    throw new StipplerError("UNSUPPORTED_IMAGE", "edge map returned multi-channel data");
  }
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

/**
 * Rasterise a stipple SVG (viewBox only, no width/height attributes) to PNG
 * at an integer scale factor, flattened onto white.
 */
export async function rasterizeSvgToPng(
  svg: string,
  scale: number,
  viewWidth: number,
  viewHeight: number,
): Promise<Buffer> {
  const sized = svg.replace(
    /^<svg /,
    `<svg width="${viewWidth * scale}" height="${viewHeight * scale}" `,
  );
  return sharp(Buffer.from(sized)).flatten({ background: "#ffffff" }).png().toBuffer();
}
