import { z } from "zod";
import { StipplerError } from "../lib/errors";
import { err, ok, type Result } from "../lib/result";
import { type CropBox, DEFAULT_OPTIONS } from "../types";

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

/** Default PNG scale factor over the canvas size. CLI-only knob. */
export const DEFAULT_SCALE = 2;

const flagsSchema = z.object({
  dots: z.coerce.number().int().min(3).max(50_000).default(DEFAULT_OPTIONS.dots),
  iters: z.coerce.number().int().min(0).max(1_000).default(DEFAULT_OPTIONS.iters),
  gamma: z.coerce.number().positive().max(10).default(DEFAULT_OPTIONS.gamma),
  edgeBoost: z.coerce.number().min(0).max(5).default(DEFAULT_OPTIONS.edgeBoost),
  seed: z.coerce.number().int().nonnegative().default(DEFAULT_OPTIONS.seed),
  ink: hexColor.default(DEFAULT_OPTIONS.ink),
  scale: z.coerce.number().int().min(1).max(8).default(DEFAULT_SCALE),
  cutout: z.boolean().default(DEFAULT_OPTIONS.cutout),
  crop: cropSchema.optional(),
  modelPath: z.string().min(1).optional(),
  out: z.string().min(1).optional(),
});

/** Validated CLI flags with defaults applied. */
export type Flags = z.infer<typeof flagsSchema>;

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
  return ok(parsed.data);
}
