import { z } from "zod";
import { StipplerError } from "../lib/errors";
import { err, ok, type Result } from "../lib/result";
import type { CropBox } from "../types";

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "ink must be a hex colour like #1a1a1a");

const cropSchema = z.string().transform((s, ctx): CropBox => {
  const parts = s.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    ctx.addIssue({ code: "custom", message: "crop must be four numbers: x0,y0,x1,y1" });
    return z.NEVER;
  }
  const [x0, y0, x1, y1] = parts as [number, number, number, number];
  if (x0 < 0 || y0 < 0 || x1 > 1 || y1 > 1 || x0 >= x1 || y0 >= y1) {
    ctx.addIssue({
      code: "custom",
      message: "crop values must satisfy 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1",
    });
    return z.NEVER;
  }
  return { x0, y0, x1, y1 };
});

const flagsSchema = z.object({
  dots: z.coerce.number().int().min(3).max(50_000).default(2200),
  iters: z.coerce.number().int().min(0).max(1_000).default(45),
  gamma: z.coerce.number().positive().max(10).default(1.45),
  edgeBoost: z.coerce.number().min(0).max(5).default(0.4),
  seed: z.coerce.number().int().nonnegative().default(7),
  ink: hexColor.default("#1a1a1a"),
  scale: z.coerce.number().int().min(1).max(8).default(2),
  cutout: z.boolean().default(true),
  crop: cropSchema.optional(),
  modelPath: z.string().min(1).optional(),
  out: z.string().min(1).optional(),
});

/** Validated CLI flags with defaults applied. */
export type Flags = z.infer<typeof flagsSchema>;

/** Output formats inferred from the -o extension. */
export type OutputFormat = "svg" | "png";

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

/** Validate the raw citty arg bag into typed flags. */
export function parseFlags(raw: Record<string, unknown>): Result<Flags, StipplerError> {
  const parsed = flagsSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path.length > 0 ? `--${path}: ${issue.message}` : issue.message;
      })
      .join("; ");
    return err(new StipplerError("INVALID_FLAGS", issues));
  }
  const formatCheck = outputFormat(parsed.data.out);
  if (!formatCheck.success) return formatCheck;
  return ok(parsed.data);
}
