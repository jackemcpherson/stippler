/**
 * Domain types for the stippler pipeline.
 *
 * The working canvas is fixed at 360x432 (the SVG viewBox); every input is
 * cropped/framed and then padded onto this canvas before stippling.
 */

/** Working canvas width in pixels; also the SVG viewBox width. */
export const CANVAS_WIDTH = 360;

/** Working canvas height in pixels; also the SVG viewBox height. */
export const CANVAS_HEIGHT = 432;

/**
 * Fractional crop box applied when background removal is disabled and no
 * explicit crop is given: a top-centre bust framing.
 */
export const DEFAULT_CROP: CropBox = { x0: 0.125, y0: 0.02, x1: 0.875, y1: 0.92 };

/**
 * Fractional crop box in [0, 1] image coordinates.
 *
 * Requires 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1.
 */
export interface CropBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Options for {@link generateHedcut}. All fields have tuned defaults. */
export interface HedcutOptions {
  /** Target number of stipple dots. Default 2200. */
  readonly dots?: number;
  /** Lloyd relaxation iterations. Default 45. */
  readonly iters?: number;
  /** Darkness exponent; higher concentrates dots in shadows. Default 1.45. */
  readonly gamma?: number;
  /** Edge-detection contribution to density in [0, 5]. Default 0.4. */
  readonly edgeBoost?: number;
  /** PRNG seed for deterministic output. Default 7. */
  readonly seed?: number;
  /** Dot colour as a hex string. Default "#1a1a1a". */
  readonly ink?: string;
  /**
   * Run U2Net background removal and head-normalised framing. Default true.
   * When true, {@link modelPath} must point to a u2net.onnx file.
   */
  readonly cutout?: boolean;
  /** Path to u2net.onnx. Required when cutout is enabled; never downloaded here. */
  readonly modelPath?: string;
  /** Fractional pre-crop applied before matting (or instead of DEFAULT_CROP). */
  readonly crop?: CropBox;
}

/** Result payload of {@link generateHedcut}. */
export interface HedcutOutput {
  /** Complete SVG document. */
  readonly svg: string;
  /** Number of dots rendered. */
  readonly dotCount: number;
  /** SVG viewBox width (always 360). */
  readonly width: number;
  /** SVG viewBox height (always 432). */
  readonly height: number;
}

/** Single-channel 8-bit image in scanline order. */
export interface GrayImage {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Interleaved 3-channel 8-bit RGB image in scanline order. */
export interface RgbImage {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Pixel frame produced by head-normalised framing (may extend past the image). */
export interface Frame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}
