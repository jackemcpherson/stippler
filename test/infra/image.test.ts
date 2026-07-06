import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cropFractional, decodeToRgb, edgeMap, rasterizeSvgToPng } from "../../src/infra/image";
import { StipplerError } from "../../src/lib/errors";
import type { GrayImage, RgbImage } from "../../src/types";

async function makePng(width: number, height: number, rgb: [number, number, number]) {
  return sharp({
    create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } },
  })
    .png()
    .toBuffer();
}

describe("decodeToRgb", () => {
  it("round-trips dimensions and pixel values", async () => {
    const png = await makePng(12, 8, [200, 100, 50]);
    const im = await decodeToRgb(png);
    expect(im.width).toBe(12);
    expect(im.height).toBe(8);
    expect(im.data[0]).toBe(200);
    expect(im.data[1]).toBe(100);
    expect(im.data[2]).toBe(50);
  });

  it("throws UNSUPPORTED_IMAGE for undecodable buffers", async () => {
    await expect(decodeToRgb(Buffer.from("not an image"))).rejects.toThrowError(StipplerError);
  });
});

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

describe("edgeMap", () => {
  it("returns near-zero for a constant image", async () => {
    const im: GrayImage = { data: new Uint8Array(20 * 20).fill(128), width: 20, height: 20 };
    const out = await edgeMap(im);
    const interior: number[] = [];
    for (let y = 2; y < 18; y++) {
      for (let x = 2; x < 18; x++) {
        interior.push(out.data[y * 20 + x] ?? 0);
      }
    }
    expect(Math.max(...interior)).toBe(0);
  });

  it("responds at a vertical step edge", async () => {
    const data = new Uint8Array(20 * 20);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        data[y * 20 + x] = x < 10 ? 0 : 255;
      }
    }
    const out = await edgeMap({ data, width: 20, height: 20 });
    // The zero-sum kernel goes negative on the dark side (clamped to 0) and
    // positive on the bright side, so the response sits at x=10, not x=9.
    const nearEdge = out.data[10 * 20 + 10] ?? 0;
    const farField = out.data[10 * 20 + 3] ?? 0;
    expect(nearEdge).toBeGreaterThan(50);
    expect(farField).toBeLessThan(10);
  });
});

describe("rasterizeSvgToPng", () => {
  it("renders at scale with a dark dot centre and white corners", async () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 432" role="img">',
      '<path stroke="#1a1a1a" stroke-width="40" stroke-linecap="round" fill="none" d="M180 216h.01"/>',
      "</svg>",
    ].join("\n");
    const png = await rasterizeSvgToPng(svg, 2, 360, 432);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(720);
    expect(info.height).toBe(864);
    const centre = data[(432 * 720 + 360) * info.channels] ?? 255;
    const corner = data[0] ?? 0;
    expect(centre).toBeLessThan(100);
    expect(corner).toBe(255);
  });
});
