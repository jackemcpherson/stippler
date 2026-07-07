import { describe, expect, it } from "vitest";
import { compositeOnWhite, computeHeadFrame, pasteRgbOnWhite } from "../../src/core/head-frame";
import type { RgbImage } from "../../src/types";

/** Matte with a solid rectangle of value 1.0 at the given bounds. */
function rectMatte(
  width: number,
  height: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): Float64Array {
  const m = new Float64Array(width * height);
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      m[y * width + x] = 1;
    }
  }
  return m;
}

describe("computeHeadFrame", () => {
  it("frames a solid rectangle per the ported math", () => {
    // 40-wide, 100-tall rectangle at x=30, y=20 in a 100x160 matte.
    const m = rectMatte(100, 160, 30, 20, 40, 100);
    const frame = computeHeadFrame(m, 100, 160);
    // y0=20, y1=119; zone rows = max(1, trunc(0.2*99)) = 19; widths all 40;
    // percentile80 = 40; size = trunc(1.75*40) = 70; cx = trunc(mean of 30..69) = 49;
    // left = 49 - 35 = 14; top = trunc(20 - 7) = 13; height = trunc(1.2*70) = 84.
    expect(frame).toEqual({ left: 14, top: 13, width: 70, height: 84 });
  });

  it("returns the full frame for an empty matte", () => {
    const frame = computeHeadFrame(new Float64Array(50 * 60), 50, 60);
    expect(frame).toEqual({ left: 0, top: 0, width: 50, height: 60 });
  });

  it("returns the full frame when the matte is too sparse to measure a head", () => {
    // Two isolated pixels: y0=5, y1=15 in a 20x30 image.
    // zoneRows = max(1, trunc(0.2*(15-5))) = 2; zone covers y=5 and y=6.
    // Row y=5 has 1 pixel, row y=6 has 0 -> widths=[1,0].
    // percentile([0,1], 80): pos=0.8, result=0.8; headW=trunc(0.8)=0 -> size=0 < 1.
    const width = 20;
    const height = 30;
    const m = new Float64Array(width * height);
    m[5 * width + 10] = 1.0; // y=5, x=10
    m[15 * width + 10] = 1.0; // y=15, x=10
    const frame = computeHeadFrame(m, width, height);
    expect(frame).toEqual({ left: 0, top: 0, width, height });
  });

  it("truncates a negative fractional top toward zero", () => {
    // Rectangle touching the top edge: y0=0, head_w=40, size=70,
    // top = trunc(0 - 7) = -7 (trunc and floor agree at integers; use a
    // fractional case: head_w=41 -> size=71, top = trunc(-7.1) = -7 not -8).
    const m = rectMatte(100, 160, 30, 0, 41, 100);
    const frame = computeHeadFrame(m, 100, 160);
    expect(frame.width).toBe(Math.trunc(1.75 * 41));
    expect(frame.top).toBe(Math.trunc(0 - 0.1 * frame.width));
    expect(frame.top).toBe(-7);
  });
});

describe("pasteRgbOnWhite", () => {
  it("clips negative offsets and fills out-of-frame with white", () => {
    const src: RgbImage = {
      data: new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]),
      width: 2,
      height: 2,
    };
    const out = pasteRgbOnWhite(src, { left: -1, top: -1, width: 3, height: 3 });
    // Canvas (0,0) maps to source (-1,-1): white.
    expect(out.data.slice(0, 3)).toEqual(new Uint8Array([255, 255, 255]));
    // Canvas (1,1) maps to source (0,0).
    const i11 = 3 * (1 * 3 + 1);
    expect(out.data.slice(i11, i11 + 3)).toEqual(new Uint8Array([10, 20, 30]));
    // Canvas (2,2) maps to source (1,1).
    const i22 = 3 * (2 * 3 + 2);
    expect(out.data.slice(i22, i22 + 3)).toEqual(new Uint8Array([100, 110, 120]));
  });
});

describe("compositeOnWhite", () => {
  it("is identity at matte 1, white at matte 0, truncated midpoint at 0.5", () => {
    const src: RgbImage = { data: new Uint8Array([100, 150, 200]), width: 1, height: 1 };
    expect(compositeOnWhite(src, Float64Array.of(1)).data).toEqual(new Uint8Array([100, 150, 200]));
    expect(compositeOnWhite(src, Float64Array.of(0)).data).toEqual(new Uint8Array([255, 255, 255]));
    expect(compositeOnWhite(src, Float64Array.of(0.5)).data).toEqual(
      new Uint8Array([177, 202, 227]),
    );
  });
});
