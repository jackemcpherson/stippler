import type { GrayImage, RgbImage } from "../src/types";

/** Solid-colour RGB test fixture. */
export function solidRgb(width: number, height: number, r: number, g: number, b: number): RgbImage {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[3 * i] = r;
    data[3 * i + 1] = g;
    data[3 * i + 2] = b;
  }
  return { data, width, height };
}

/** Grayscale test fixture filled per pixel index. */
export function gray(width: number, height: number, fill: (i: number) => number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = fill(i);
  return { data, width, height };
}
