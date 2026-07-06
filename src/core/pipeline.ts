import { decodeToRgb, edgeMap, resizeGray } from "../infra/image";
import { StipplerError } from "../lib/errors";
import { createRng } from "../lib/random";
import { err, ok, type Result } from "../lib/result";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_CROP,
  DEFAULT_OPTIONS,
  type HedcutOptions,
  type HedcutOutput,
  type RgbImage,
} from "../types";
import {
  autocontrast,
  buildDensity,
  containPlacement,
  grayscaleFromRgb,
  pasteGrayOnWhite,
} from "./density";
import { compositeOnWhite, computeHeadFrame, pasteRgbOnWhite } from "./head-frame";
import { cropFractional } from "./raster";
import { stipple } from "./stipple";
import { renderSvg } from "./svg";

type ResolvedOptions = typeof DEFAULT_OPTIONS;

function resolveOptions(options: HedcutOptions): ResolvedOptions {
  return {
    dots: options.dots ?? DEFAULT_OPTIONS.dots,
    iters: options.iters ?? DEFAULT_OPTIONS.iters,
    gamma: options.gamma ?? DEFAULT_OPTIONS.gamma,
    edgeBoost: options.edgeBoost ?? DEFAULT_OPTIONS.edgeBoost,
    seed: options.seed ?? DEFAULT_OPTIONS.seed,
    ink: options.ink ?? DEFAULT_OPTIONS.ink,
    cutout: options.cutout ?? DEFAULT_OPTIONS.cutout,
  };
}

/**
 * Generate a WSJ-hedcut-style stipple SVG from an encoded image.
 *
 * Weighted Voronoi stippling (Secord 2002): dots are seeded by darkness,
 * then relaxed with Lloyd iterations so spacing stays even while density
 * follows tone. An oval vignette fades the portrait out toward the edges,
 * giving every head the same bust-crop silhouette.
 *
 * Performs no filesystem or network access beyond reading the ONNX model at
 * `options.modelPath` when background removal is enabled — resolve and
 * download the model beforehand (the CLI uses the XDG cache for this).
 *
 * @param image - Encoded image bytes (any sharp-supported format).
 * @param options - Tuning knobs; see {@link HedcutOptions} for defaults.
 * @returns The SVG document and dot statistics, or a {@link StipplerError}.
 *
 * @example
 * ```typescript
 * const result = await generateHedcut(await readFile("photo.jpg"), {
 *   dots: 2400,
 *   modelPath: "/path/to/u2net.onnx",
 * });
 * if (result.success) {
 *   await writeFile("out.svg", result.data.svg);
 * }
 * ```
 */
export async function generateHedcut(
  image: Buffer,
  options: HedcutOptions = {},
): Promise<Result<HedcutOutput, StipplerError>> {
  const resolved = resolveOptions(options);
  const modelPath = options.modelPath;
  // Warm the ONNX session while the image decodes — model load dominates startup.
  const sessionPromise =
    resolved.cutout && modelPath !== undefined
      ? import("../infra/matte").then((m) => m.createMatteSession(modelPath))
      : undefined;
  sessionPromise?.catch(() => {}); // surfaced below when awaited
  try {
    let rgb = await decodeToRgb(image);

    if (options.crop !== undefined) {
      rgb = cropFractional(rgb, options.crop);
    }

    let framed: RgbImage;
    if (resolved.cutout) {
      if (sessionPromise === undefined) {
        return err(
          new StipplerError(
            "MODEL_NOT_FOUND",
            "background removal needs options.modelPath — the library never downloads the model",
          ),
        );
      }
      const session = await sessionPromise;
      const matte = await session.alphaMatte(rgb);
      const composited = compositeOnWhite(rgb, matte);
      const frame = computeHeadFrame(matte, rgb.width, rgb.height);
      framed = pasteRgbOnWhite(composited, frame);
    } else {
      framed = options.crop === undefined ? cropFractional(rgb, DEFAULT_CROP) : rgb;
    }

    const gray = grayscaleFromRgb(framed);
    const placement = containPlacement(gray.width, gray.height, CANVAS_WIDTH, CANVAS_HEIGHT);
    const resized = await resizeGray(gray, placement.width, placement.height);
    const padded = pasteGrayOnWhite(
      resized,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      placement.left,
      placement.top,
    );
    const contrasted = autocontrast(padded, 1);
    const edges = await edgeMap(contrasted);
    const density = buildDensity(contrasted, edges, resolved.gamma, resolved.edgeBoost);

    const rng = createRng(resolved.seed);
    const { points, darkness } = stipple(
      density,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      resolved.dots,
      resolved.iters,
      rng,
    );
    const svg = renderSvg(points, darkness, resolved.ink, CANVAS_WIDTH, CANVAS_HEIGHT);
    return ok({ svg, dotCount: darkness.length });
  } catch (error) {
    if (error instanceof StipplerError) {
      return err(error);
    }
    throw error;
  }
}
