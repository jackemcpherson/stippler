import sharp from "sharp";
import { StipplerError } from "../lib/errors";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type GrayImage, type RgbImage } from "../types";

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

/**
 * Finish a sharp pipeline that must produce single-channel output.
 *
 * sharp expands single-channel raw input to 3 channels when processing;
 * extractChannel(0) forces the output back to one channel, and the guard
 * catches regressions of that workaround.
 */
async function toGray(pipeline: sharp.Sharp, what: string): Promise<GrayImage> {
  const { data, info } = await pipeline
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) {
    throw new StipplerError("UNSUPPORTED_IMAGE", `${what} returned multi-channel data`);
  }
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

/**
 * Resize a grayscale image with `fit: "fill"` (PIL `resize` semantics —
 * exact target dimensions, no aspect preservation) and lanczos3.
 */
export async function resizeGray(im: GrayImage, width: number, height: number): Promise<GrayImage> {
  return toGray(
    sharp(im.data, { raw: { width: im.width, height: im.height, channels: 1 } }).resize(
      width,
      height,
      { fit: "fill", kernel: "lanczos3" },
    ),
    "grayscale resize",
  );
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
  return toGray(
    sharp(gray.data, { raw: { width: gray.width, height: gray.height, channels: 1 } })
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
        scale: 1,
        offset: 0,
      })
      .blur(1),
    "edge map",
  );
}

/**
 * Rasterise a stipple SVG to PNG at an integer scale factor, flattened onto
 * white. The SVG's intrinsic size is its viewBox (360x432); rendering at
 * `72 * scale` DPI scales the vector output without touching the markup.
 */
export async function rasterizeSvgToPng(svg: string, scale: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 72 * scale })
    .resize(CANVAS_WIDTH * scale, CANVAS_HEIGHT * scale, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
}
