import { preprocessForU2Net, rescaleMinMax, U2NET_SIZE } from "../core/matte-math";
import { StipplerError } from "../lib/errors";
import type { RgbImage } from "../types";
import { resizeGray, resizeRgb } from "./image";

/** A loaded U2Net session that predicts foreground mattes. */
export interface MatteSession {
  /** Predict a [0, 1] foreground matte at the image's original size. */
  alphaMatte(im: RgbImage): Promise<Float64Array>;
}

/**
 * Load u2net.onnx via onnxruntime-node (imported dynamically so the native
 * runtime is only paid for when the cutout stage actually runs).
 */
export async function createMatteSession(modelPath: string): Promise<MatteSession> {
  let ort: typeof import("onnxruntime-node");
  let session: import("onnxruntime-node").InferenceSession;
  try {
    ort = await import("onnxruntime-node");
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["cpu"],
    });
  } catch (cause) {
    throw new StipplerError("MATTE_FAILED", `could not load u2net model at ${modelPath}`, {
      cause,
    });
  }

  return {
    async alphaMatte(im: RgbImage): Promise<Float64Array> {
      try {
        const small = await resizeRgb(im, U2NET_SIZE, U2NET_SIZE);
        const chw = preprocessForU2Net(small);
        const tensor = new ort.Tensor("float32", chw, [1, 3, U2NET_SIZE, U2NET_SIZE]);
        const inputName = session.inputNames[0];
        if (inputName === undefined) {
          throw new Error("model has no inputs");
        }
        const outputs = await session.run({ [inputName]: tensor });
        const firstOutput = session.outputNames[0];
        if (firstOutput === undefined) {
          throw new Error("model has no outputs");
        }
        // U2Net emits 7 side outputs; index 0 is the fused [1,1,320,320] map.
        const pred = outputs[firstOutput]?.data as Float32Array;
        const rescaled = rescaleMinMax(pred);

        // Back to uint8 (truncating, matching numpy astype), then resize to
        // the original dimensions and normalise to [0, 1].
        const gray = new Uint8Array(rescaled.length);
        for (let i = 0; i < rescaled.length; i++) {
          gray[i] = Math.trunc((rescaled[i] ?? 0) * 255);
        }
        const resized = await resizeGray(
          { data: gray, width: U2NET_SIZE, height: U2NET_SIZE },
          im.width,
          im.height,
        );
        const matte = new Float64Array(resized.data.length);
        for (let i = 0; i < resized.data.length; i++) {
          matte[i] = (resized.data[i] ?? 0) / 255;
        }
        return matte;
      } catch (cause) {
        if (cause instanceof StipplerError) throw cause;
        throw new StipplerError("MATTE_FAILED", "u2net inference failed", { cause });
      }
    },
  };
}
