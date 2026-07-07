import { describe, expect, it, vi } from "vitest";
import { createMatteSession } from "../../src/infra/matte";
import { StipplerError } from "../../src/lib/errors";

const releaseSpy = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("onnxruntime-node", () => ({
  InferenceSession: {
    create: vi.fn(async () => ({
      inputNames: [],
      outputNames: [],
      run: vi.fn(),
      release: releaseSpy,
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

  it("releases the native session when model validation fails at load time", async () => {
    releaseSpy.mockClear();
    await expect(createMatteSession("/fake/u2net.onnx")).rejects.toThrowError(StipplerError);
    expect(releaseSpy).toHaveBeenCalled();
  });
});
