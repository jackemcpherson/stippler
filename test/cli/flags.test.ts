import { describe, expect, it } from "vitest";
import { outputFormat, parseFlags } from "../../src/cli/flags";
import { DEFAULT_OPTIONS } from "../../src/types";

describe("parseFlags", () => {
  it("materialises all defaults from an empty bag", () => {
    const result = parseFlags({ cutout: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ ...DEFAULT_OPTIONS, scale: 2, format: "svg" });
      expect(result.data.crop).toBeUndefined();
    }
  });

  it("coerces numeric strings from the CLI", () => {
    const result = parseFlags({ cutout: false, dots: "3000", gamma: "1.2", seed: "0" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dots).toBe(3000);
      expect(result.data.gamma).toBe(1.2);
      expect(result.data.seed).toBe(0);
      expect(result.data.cutout).toBe(false);
    }
  });

  it("parses a valid crop string", () => {
    const result = parseFlags({ cutout: true, crop: "0.1, 0, 0.9, 1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.crop).toEqual({ x0: 0.1, y0: 0, x1: 0.9, y1: 1 });
    }
  });

  it.each([
    ["0.9,0,0.1,1", "x0 >= x1"],
    ["0.1,0,0.9", "three parts"],
    ["a,b,c,d", "non-numeric"],
    ["0,-0.1,1,1", "negative"],
    ["0,0,1,1.5", "out of range"],
  ])("rejects crop %s (%s)", (crop) => {
    const result = parseFlags({ cutout: true, crop });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INVALID_FLAGS");
  });

  it("accepts 3- and 6-digit hex ink, rejects names", () => {
    expect(parseFlags({ cutout: true, ink: "#ABC" }).success).toBe(true);
    expect(parseFlags({ cutout: true, ink: "#1a2b3c" }).success).toBe(true);
    expect(parseFlags({ cutout: true, ink: "red" }).success).toBe(false);
  });

  it.each([
    ["dots", "0"],
    ["dots", "2.5"],
    ["iters", "-1"],
    ["gamma", "0"],
    ["gamma", "11"],
    ["seed", "-3"],
    ["scale", "9"],
    ["edgeBoost", "6"],
  ])("rejects out-of-range %s=%s", (key, value) => {
    const result = parseFlags({ cutout: true, [key]: value });
    expect(result.success).toBe(false);
  });

  it("rejects unsupported output extensions", () => {
    const result = parseFlags({ cutout: true, out: "x.webp" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain("webp");
  });

  it("accepts .svg and case-insensitive .PNG outputs", () => {
    expect(parseFlags({ cutout: true, out: "x.svg" }).success).toBe(true);
    expect(parseFlags({ cutout: true, out: "x.PNG" }).success).toBe(true);
  });
});

describe("outputFormat", () => {
  it("defaults to svg when no path is given", () => {
    const result = outputFormat(undefined);
    expect(result.success && result.data).toBe("svg");
  });

  it("infers png case-insensitively", () => {
    const result = outputFormat("out.PNG");
    expect(result.success && result.data).toBe("png");
  });
});
