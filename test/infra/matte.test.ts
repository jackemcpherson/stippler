import { describe, expect, it } from "vitest";
import { preprocessForU2Net, rescaleMinMax } from "../../src/infra/matte";
import type { RgbImage } from "../../src/types";

const PLANE = 320 * 320;

function solid(r: number, g: number, b: number): RgbImage {
  const data = new Uint8Array(PLANE * 3);
  for (let i = 0; i < PLANE; i++) {
    data[3 * i] = r;
    data[3 * i + 1] = g;
    data[3 * i + 2] = b;
  }
  return { data, width: 320, height: 320 };
}

describe("preprocessForU2Net", () => {
  it("lays out channels in CHW order", () => {
    const im = solid(255, 0, 0);
    const chw = preprocessForU2Net(im);
    // Red plane first: index 0 belongs to channel 0 at pixel (0,0).
    expect(chw[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    // Green plane starts at PLANE.
    expect(chw[PLANE]).toBeCloseTo((0 - 0.456) / 0.224, 5);
    // Blue plane starts at 2*PLANE.
    expect(chw[2 * PLANE]).toBeCloseTo((0 - 0.406) / 0.225, 5);
  });

  it("normalises pure white to (1 - mean) / std per channel", () => {
    const chw = preprocessForU2Net(solid(255, 255, 255));
    expect(chw[0]).toBeCloseTo((1 - 0.485) / 0.229, 6);
    expect(chw[PLANE]).toBeCloseTo((1 - 0.456) / 0.224, 6);
    expect(chw[2 * PLANE]).toBeCloseTo((1 - 0.406) / 0.225, 6);
  });
});

describe("rescaleMinMax", () => {
  it("maps the range onto [0, 1]", () => {
    const out = rescaleMinMax(Float32Array.of(2, 4, 6));
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[2]).toBeCloseTo(1, 6);
    expect(out[1]).toBeCloseTo(0.5, 6);
  });

  it("guards constant input with the 1e-9 denominator (no NaN)", () => {
    const out = rescaleMinMax(Float32Array.of(3, 3, 3));
    for (const v of out) {
      expect(Number.isNaN(v)).toBe(false);
      expect(v).toBe(0);
    }
  });
});
