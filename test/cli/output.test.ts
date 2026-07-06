import { mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { writeOutput } from "../../src/cli/output";

const SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 432" role="img">',
  '<path stroke="#1a1a1a" stroke-width="3" stroke-linecap="round" fill="none" d="M180 216h.01"/>',
  "</svg>",
].join("\n");

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "stippler-out-"));
});

describe("writeOutput", () => {
  it("writes SVG to an explicit path", async () => {
    const result = await writeOutput(SVG, {
      out: join(dir, "nested", "a.svg"),
      inputStem: "x",
      scale: 2,
      width: 360,
      height: 432,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(await readFile(result.data, "utf8")).toBe(SVG);
    }
  });

  it("rasterises to PNG at the requested scale", async () => {
    const result = await writeOutput(SVG, {
      out: join(dir, "a.png"),
      inputStem: "x",
      scale: 2,
      width: 360,
      height: 432,
    });
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
      const result = await writeOutput(SVG, {
        inputStem: "portrait",
        scale: 2,
        width: 360,
        height: 432,
      });
      expect(result.success).toBe(true);
      // macOS tmpdir is a symlink (/var -> /private/var); compare real paths.
      if (result.success) expect(result.data).toBe(join(await realpath(dir), "portrait.svg"));
    } finally {
      process.chdir(cwd);
    }
  });
});
