import { describe, expect, it } from "vitest";
import {
  IMAGENET_MEAN,
  IMAGENET_STD,
  preprocessForU2Net,
  rescaleMinMax,
  U2NET_SIZE,
} from "../../src/core/matte-math";
import { solidRgb } from "../helpers";

const PLANE = U2NET_SIZE * U2NET_SIZE;

function solid(r: number, g: number, b: number) {
  return solidRgb(U2NET_SIZE, U2NET_SIZE, r, g, b);
}

describe("preprocessForU2Net", () => {
  it("lays out channels in CHW order", () => {
    const im = solid(255, 0, 0);
    const chw = preprocessForU2Net(im);
    // Red plane first: index 0 belongs to channel 0 at pixel (0,0).
    expect(chw[0]).toBeCloseTo((1 - IMAGENET_MEAN[0]) / IMAGENET_STD[0], 5);
    // Green plane starts at PLANE.
    expect(chw[PLANE]).toBeCloseTo((0 - IMAGENET_MEAN[1]) / IMAGENET_STD[1], 5);
    // Blue plane starts at 2*PLANE.
    expect(chw[2 * PLANE]).toBeCloseTo((0 - IMAGENET_MEAN[2]) / IMAGENET_STD[2], 5);
  });

  it("normalises pure white to (1 - mean) / std per channel", () => {
    const chw = preprocessForU2Net(solid(255, 255, 255));
    expect(chw[0]).toBeCloseTo((1 - IMAGENET_MEAN[0]) / IMAGENET_STD[0], 6);
    expect(chw[PLANE]).toBeCloseTo((1 - IMAGENET_MEAN[1]) / IMAGENET_STD[1], 6);
    expect(chw[2 * PLANE]).toBeCloseTo((1 - IMAGENET_MEAN[2]) / IMAGENET_STD[2], 6);
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
