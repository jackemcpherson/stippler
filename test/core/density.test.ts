import { describe, expect, it } from "vitest";
import {
  autocontrast,
  buildDensity,
  containPlacement,
  grayscaleFromRgb,
  pasteGrayOnWhite,
} from "../../src/core/density";
import type { GrayImage, RgbImage } from "../../src/types";

function solidRgb(width: number, height: number, r: number, g: number, b: number): RgbImage {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[3 * i] = r;
    data[3 * i + 1] = g;
    data[3 * i + 2] = b;
  }
  return { data, width, height };
}

function gray(width: number, height: number, fill: (i: number) => number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = fill(i);
  return { data, width, height };
}

describe("grayscaleFromRgb", () => {
  it("matches PIL's Rec.601 integer luma for primaries", () => {
    expect(grayscaleFromRgb(solidRgb(1, 1, 255, 0, 0)).data[0]).toBe(76);
    expect(grayscaleFromRgb(solidRgb(1, 1, 0, 255, 0)).data[0]).toBe(150);
    expect(grayscaleFromRgb(solidRgb(1, 1, 0, 0, 255)).data[0]).toBe(29);
  });

  it("preserves white and black", () => {
    expect(grayscaleFromRgb(solidRgb(1, 1, 255, 255, 255)).data[0]).toBe(255);
    expect(grayscaleFromRgb(solidRgb(1, 1, 0, 0, 0)).data[0]).toBe(0);
  });
});

describe("autocontrast", () => {
  it("leaves a constant image unchanged", () => {
    const im = gray(10, 10, () => 128);
    expect(Array.from(autocontrast(im, 1).data)).toEqual(Array.from(im.data));
  });

  it("stretches a linear ramp to the full range", () => {
    const im = gray(100, 1, (i) => 50 + Math.floor((i / 99) * 150));
    const out = autocontrast(im, 0);
    expect(Math.min(...out.data)).toBe(0);
    expect(Math.max(...out.data)).toBe(255);
  });

  it("clips single outliers with cutoff", () => {
    // 10k pixels at 100..150, one outlier at 255; cutoff=1 removes 100 pixels
    // of mass from each end, so 255 cannot survive as the histogram maximum.
    const im = gray(100, 100, (i) => (i === 0 ? 255 : 100 + (i % 51)));
    const out = autocontrast(im, 1);
    // The outlier maps to the same LUT ceiling as the true max (clamped).
    const nonOutlier = Array.from(out.data.slice(1));
    expect(Math.max(...nonOutlier)).toBe(255);
    expect(Math.min(...nonOutlier)).toBe(0);
  });
});

describe("containPlacement", () => {
  it("computes PIL pad placement with 0.35 vertical centering", () => {
    const p = containPlacement(100, 100, 360, 432);
    expect(p).toEqual({ width: 360, height: 360, left: 0, top: 25 });
  });

  it("handles wide sources", () => {
    const p = containPlacement(200, 100, 360, 432);
    expect(p.width).toBe(360);
    expect(p.height).toBe(180);
    expect(p.left).toBe(0);
    expect(p.top).toBe(Math.round((432 - 180) * 0.35));
  });
});

describe("pasteGrayOnWhite", () => {
  it("pads with white around the source", () => {
    const src = gray(2, 2, () => 0);
    const out = pasteGrayOnWhite(src, 4, 4, 1, 1);
    expect(out.data[0]).toBe(255);
    expect(out.data[4 * 1 + 1]).toBe(0);
    expect(out.data[4 * 2 + 2]).toBe(0);
    expect(out.data[15]).toBe(255);
  });
});

describe("buildDensity", () => {
  const W = 360;
  const H = 432;
  const whiteEdge = gray(W, H, () => 0);

  it("returns all zeros for a white image", () => {
    const d = buildDensity(
      gray(W, H, () => 255),
      whiteEdge,
      1.45,
      0.4,
    );
    expect(d.every((v) => v === 0)).toBe(true);
  });

  it("vignettes corners to zero and keeps centre near 1 for black input", () => {
    const d = buildDensity(
      gray(W, H, () => 0),
      whiteEdge,
      1.45,
      0,
    );
    expect(d[0]).toBe(0);
    expect(d[W - 1]).toBe(0);
    expect(d[W * H - 1]).toBe(0);
    const centre = d[Math.floor(H * 0.46) * W + Math.floor(W / 2)] ?? 0;
    expect(centre).toBeCloseTo(1, 5);
  });

  it("keeps all values in [0, 1] with no sub-threshold residue", () => {
    const d = buildDensity(
      gray(W, H, (i) => i % 256),
      gray(W, H, (i) => (i * 7) % 256),
      1.45,
      0.4,
    );
    for (const v of d) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (v > 0) expect(v).toBeGreaterThanOrEqual(0.01);
    }
  });

  it("is monotone in gamma for mid-gray input", () => {
    const mid = gray(W, H, () => 128);
    const low = buildDensity(mid, whiteEdge, 1, 0);
    const high = buildDensity(mid, whiteEdge, 3, 0);
    const sum = (a: Float64Array) => a.reduce((s, v) => s + v, 0);
    expect(sum(high)).toBeLessThan(sum(low));
  });

  it("reduces to darkness-only when edgeBoost is zero", () => {
    const g = gray(W, H, (i) => i % 256);
    const e = gray(W, H, (i) => (i * 13) % 256);
    const withZero = buildDensity(g, e, 1.45, 0);
    const withoutEdge = buildDensity(g, whiteEdge, 1.45, 0.4);
    expect(Array.from(withZero)).toEqual(Array.from(withoutEdge));
  });
});
