import { mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { type OutputTarget, resolveOutput, writeOutput } from "../../src/cli/output";

const SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 432" role="img">',
  '<path stroke="#1a1a1a" stroke-width="3" stroke-linecap="round" fill="none" d="M180 216h.01"/>',
  "</svg>",
].join("\n");

function target(out: string | undefined, inputStem: string): OutputTarget {
  const result = resolveOutput(out, inputStem);
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "stippler-out-"));
});

describe("resolveOutput", () => {
  it("defaults to <stem>.svg when no path is given", () => {
    const result = resolveOutput(undefined, "portrait");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("svg");
      expect(result.data.path.endsWith("portrait.svg")).toBe(true);
    }
  });

  it("infers png case-insensitively", () => {
    const result = resolveOutput("out.PNG", "x");
    expect(result.success && result.data.format).toBe("png");
  });

  it("rejects unsupported output extensions", () => {
    const result = resolveOutput("x.webp", "x");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain("webp");
  });
});

describe("writeOutput", () => {
  it("writes SVG to an explicit path", async () => {
    const result = await writeOutput(SVG, target(join(dir, "nested", "a.svg"), "x"), 2);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(await readFile(result.data, "utf8")).toBe(SVG);
    }
  });

  it("rasterises to PNG at the requested scale", async () => {
    const result = await writeOutput(SVG, target(join(dir, "a.png"), "x"), 2);
    expect(result.success).toBe(true);
    if (result.success) {
      const meta = await sharp(result.data).metadata();
      expect(meta.width).toBe(720);
      expect(meta.height).toBe(864);
      expect(meta.format).toBe("png");
    }
  });

  it("defaults to <stem>.svg in the working directory", async () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const result = await writeOutput(SVG, target(undefined, "portrait"), 2);
      expect(result.success).toBe(true);
      // macOS tmpdir is a symlink (/var -> /private/var); compare real paths.
      if (result.success) expect(result.data).toBe(join(await realpath(dir), "portrait.svg"));
    } finally {
      process.chdir(cwd);
    }
  });
});
