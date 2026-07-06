/**
 * stippler — WSJ-hedcut-style stipple portraits as compact SVGs.
 *
 * @example
 * ```typescript
 * import { readFile, writeFile } from "node:fs/promises";
 * import { generateHedcut } from "stippler";
 *
 * const result = await generateHedcut(await readFile("photo.jpg"), {
 *   dots: 2400,
 *   modelPath: "/path/to/u2net.onnx",
 * });
 * if (result.success) {
 *   await writeFile("out.svg", result.data.svg);
 * }
 * ```
 */

export { generateHedcut } from "./core/pipeline";
export { StipplerError, type StipplerErrorCode } from "./lib/errors";
export { type Err, err, type Ok, ok, type Result } from "./lib/result";
export {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type CropBox,
  DEFAULT_CROP,
  type Frame,
  type GrayImage,
  type HedcutOptions,
  type HedcutOutput,
  type RgbImage,
} from "./types";
