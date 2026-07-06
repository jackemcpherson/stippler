import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { rasterizeSvgToPng } from "../infra/image";
import { StipplerError } from "../lib/errors";
import { err, ok, type Result } from "../lib/result";
import { outputFormat } from "./flags";

/**
 * Write the SVG (or its PNG rasterisation, when the output path ends in
 * .png) and return the absolute path written.
 */
export async function writeOutput(
  svg: string,
  opts: {
    out?: string;
    inputStem: string;
    scale: number;
    width: number;
    height: number;
  },
): Promise<Result<string, StipplerError>> {
  const path = resolve(opts.out ?? `${opts.inputStem}.svg`);
  const format = outputFormat(path);
  if (!format.success) return format;
  try {
    await mkdir(dirname(path), { recursive: true });
    if (format.data === "png") {
      const png = await rasterizeSvgToPng(svg, opts.scale, opts.width, opts.height);
      await writeFile(path, png);
    } else {
      await writeFile(path, svg);
    }
    return ok(path);
  } catch (cause) {
    if (cause instanceof StipplerError) return err(cause);
    return err(new StipplerError("OUTPUT_WRITE_FAILED", `could not write ${path}`, { cause }));
  }
}
