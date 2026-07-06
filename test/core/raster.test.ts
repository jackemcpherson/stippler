import { describe, expect, it } from "vitest";
import { cropFractional, pasteOnWhite } from "../../src/core/raster";
import type { RgbImage } from "../../src/types";

describe("cropFractional", () => {
  it("crops with truncating pixel bounds", () => {
    const data = new Uint8Array(10 * 10 * 3);
    for (let i = 0; i < 100; i++) {
      data[3 * i] = i % 10; // encode x in red channel
      data[3 * i + 1] = Math.floor(i / 10); // y in green
    }
    const im: RgbImage = { data, width: 10, height: 10 };
    const out = cropFractional(im, { x0: 0.1, y0: 0, x1: 0.9, y1: 1 });
    expect(out.width).toBe(8);
    expect(out.height).toBe(10);
    expect(out.data[0]).toBe(1); // first column is source x=1
    expect(out.data[3 * (out.width - 1)]).toBe(8); // last column is source x=8
  });
});

describe("pasteOnWhite", () => {
  it("clips negative offsets and fills the rest with white", () => {
    const src = new Uint8Array(2 * 2).fill(0); // 2x2 black, 1 channel
    const out = pasteOnWhite(src, 1, 2, 2, 3, 3, -1, -1);
    // Only source pixel (1,1) lands inside, at destination (0,0).
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(255);
    expect(out[3]).toBe(255);
    expect(out[8]).toBe(255);
  });

  it("clips past the destination's far edge", () => {
    const src = new Uint8Array(2 * 2).fill(0);
    const out = pasteOnWhite(src, 1, 2, 2, 3, 3, 2, 2);
    // Only source pixel (0,0) lands inside, at destination (2,2).
    expect(out[8]).toBe(0);
    expect(out[0]).toBe(255);
    expect(out[4]).toBe(255);
  });
});
