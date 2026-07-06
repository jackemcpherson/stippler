import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { rasterizeSvgToPng } from "../infra/image";
import { StipplerError } from "../lib/errors";
import { err, ok, type Result } from "../lib/result";
import type { OutputFormat } from "./flags";

/**
 * Write the SVG (or its PNG rasterisation) and return the absolute path
 * written. The format was validated against the -o extension by parseFlags.
 */
export async function writeOutput(
  svg: string,
  opts: {
    out?: string | undefined;
    inputStem: string;
    format: OutputFormat;
    scale: number;
  },
): Promise<Result<string, StipplerError>> {
  const path = resolve(opts.out ?? `${opts.inputStem}.svg`);
  try {
    await mkdir(dirname(path), { recursive: true });
    if (opts.format === "png") {
      await writeFile(path, await rasterizeSvgToPng(svg, opts.scale));
    } else {
      await writeFile(path, svg);
    }
    return ok(path);
  } catch (cause) {
    if (cause instanceof StipplerError) return err(cause);
    return err(new StipplerError("OUTPUT_WRITE_FAILED", `could not write ${path}`, { cause }));
  }
}
