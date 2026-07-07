import sharp from "sharp";
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

/**
 * Synthetic "portrait": dark ellipse head and trapezoid shoulders on white.
 * Generated at test time so no binary fixture lives in git.
 */
export async function makePortrait(): Promise<Buffer> {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="720">',
    '<rect width="600" height="720" fill="#ffffff"/>',
    '<ellipse cx="300" cy="260" rx="140" ry="180" fill="#3a3a3a"/>',
    '<ellipse cx="255" cy="230" rx="18" ry="10" fill="#0a0a0a"/>',
    '<ellipse cx="345" cy="230" rx="18" ry="10" fill="#0a0a0a"/>',
    '<polygon points="140,720 300,470 460,720" fill="#555555"/>',
    "</svg>",
  ].join("");
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}
