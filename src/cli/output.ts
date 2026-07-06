import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { rasterizeSvgToPng } from "../infra/image";
import { StipplerError } from "../lib/errors";
import { err, ok, type Result } from "../lib/result";

/** Output formats inferred from the -o extension. */
export type OutputFormat = "svg" | "png";

/** Resolved output destination: the absolute path and its matching format. */
export interface OutputTarget {
  readonly path: string;
  readonly format: OutputFormat;
}

/** Infer the output format from a path's extension. */
export function outputFormat(out: string | undefined): Result<OutputFormat, StipplerError> {
  if (out === undefined) return ok("svg");
  const match = /\.([a-z0-9]+)$/i.exec(out);
  const ext = match?.[1]?.toLowerCase();
  if (ext === "svg" || ext === "png") return ok(ext);
  return err(
    new StipplerError("INVALID_FLAGS", `output extension must be .svg or .png, got ${out}`),
  );
}

/**
 * Resolve the output path (default `<inputStem>.svg`) and its format as one
 * value, so the path and the format written to it cannot drift apart.
 */
export function resolveOutput(
  out: string | undefined,
  inputStem: string,
): Result<OutputTarget, StipplerError> {
  const path = resolve(out ?? `${inputStem}.svg`);
  const format = outputFormat(path);
  if (!format.success) return format;
  return ok({ path, format: format.data });
}

/**
 * Write the SVG (or its PNG rasterisation) to the resolved target and return
 * the absolute path written.
 */
export async function writeOutput(
  svg: string,
  target: OutputTarget,
  scale: number,
): Promise<Result<string, StipplerError>> {
  try {
    await mkdir(dirname(target.path), { recursive: true });
    if (target.format === "png") {
      await writeFile(target.path, await rasterizeSvgToPng(svg, scale));
    } else {
      await writeFile(target.path, svg);
    }
    return ok(target.path);
  } catch (cause) {
    if (cause instanceof StipplerError) return err(cause);
    return err(
      new StipplerError("OUTPUT_WRITE_FAILED", `could not write ${target.path}`, { cause }),
    );
  }
}
