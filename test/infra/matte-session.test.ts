import { describe, expect, it, vi } from "vitest";
import { createMatteSession } from "../../src/infra/matte";
import { StipplerError } from "../../src/lib/errors";

vi.mock("onnxruntime-node", () => ({
  InferenceSession: {
    create: vi.fn(async () => ({
      inputNames: [],
      outputNames: [],
      run: vi.fn(),
      release: vi.fn(async () => {}),
    })),
  },
  Tensor: class {},
}));

describe("createMatteSession", () => {
  it("rejects a model with no inputs/outputs at load time", async () => {
    await expect(createMatteSession("/fake/u2net.onnx")).rejects.toThrowError(StipplerError);
    await expect(createMatteSession("/fake/u2net.onnx")).rejects.toMatchObject({
      code: "MATTE_FAILED",
    });
  });
});
