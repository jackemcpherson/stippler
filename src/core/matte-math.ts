/** Pure tensor math for U2Net matting, kept out of the onnxruntime adapter. */

import type { RgbImage } from "../types";

/** U2Net's fixed square input size in pixels. */
export const U2NET_SIZE = 320;

/** ImageNet per-channel normalisation mean. */
export const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;

/** ImageNet per-channel normalisation standard deviation. */
export const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

/** ImageNet-normalise a 320x320 RGB image into CHW float32 for U2Net. */
export function preprocessForU2Net(im: RgbImage): Float32Array {
  const plane = U2NET_SIZE * U2NET_SIZE;
  const chw = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      const v = (im.data[3 * i + c] ?? 0) / 255;
      chw[c * plane + i] = (v - (IMAGENET_MEAN[c] ?? 0)) / (IMAGENET_STD[c] ?? 1);
    }
  }
  return chw;
}

/** Min-max rescale a prediction plane into [0, 1]. */
export function rescaleMinMax(pred: Float32Array): Float64Array {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of pred) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const out = new Float64Array(pred.length);
  const denom = max - min + 1e-9;
  for (let i = 0; i < pred.length; i++) {
    out[i] = ((pred[i] ?? 0) - min) / denom;
  }
  return out;
}
