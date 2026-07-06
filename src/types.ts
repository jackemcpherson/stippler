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
export const DEFAULT_CROP: CropBox = Object.freeze({ x0: 0.125, y0: 0.02, x1: 0.875, y1: 0.92 });

/**
 * Tuned defaults for {@link HedcutOptions} — the single source of truth shared
 * by the library pipeline and the CLI flag schema.
 */
export const DEFAULT_OPTIONS: {
  readonly dots: number;
  readonly iters: number;
  readonly gamma: number;
  readonly edgeBoost: number;
  readonly seed: number;
  readonly ink: string;
  readonly cutout: boolean;
} = Object.freeze({
  dots: 2200,
  iters: 45,
  gamma: 1.45,
  edgeBoost: 0.4,
  seed: 7,
  ink: "#1a1a1a",
  cutout: true,
});

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

/** Options for {@link generateHedcut}. Defaults come from {@link DEFAULT_OPTIONS}. */
export interface HedcutOptions {
  /** Target number of stipple dots. */
  readonly dots?: number | undefined;
  /** Lloyd relaxation iterations. */
  readonly iters?: number | undefined;
  /** Darkness exponent; higher concentrates dots in shadows. */
  readonly gamma?: number | undefined;
  /** Edge-detection contribution to density in [0, 5]. */
  readonly edgeBoost?: number | undefined;
  /** PRNG seed for deterministic output. */
  readonly seed?: number | undefined;
  /** Dot colour as a hex string. */
  readonly ink?: string | undefined;
  /**
   * Run U2Net background removal and head-normalised framing.
   * When true, {@link modelPath} must point to a u2net.onnx file.
   */
  readonly cutout?: boolean | undefined;
  /** Path to u2net.onnx. Required when cutout is enabled; never downloaded here. */
  readonly modelPath?: string | undefined;
  /** Fractional pre-crop applied before matting (or instead of DEFAULT_CROP). */
  readonly crop?: CropBox | undefined;
}

/** Result payload of {@link generateHedcut}. The SVG viewBox is always CANVAS_WIDTH x CANVAS_HEIGHT. */
export interface HedcutOutput {
  /** Complete SVG document. */
  readonly svg: string;
  /** Number of dots rendered. */
  readonly dotCount: number;
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
