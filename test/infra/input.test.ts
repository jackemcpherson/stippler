import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inputStem, resolveInput } from "../../src/infra/input";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveInput", () => {
  it("reads a local file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stippler-"));
    const path = join(dir, "img.jpg");
    await writeFile(path, Buffer.from([1, 2, 3]));
    const result = await resolveInput(path);
    expect(result.success).toBe(true);
    if (result.success) expect(Array.from(result.data)).toEqual([1, 2, 3]);
  });

  it("returns INPUT_NOT_FOUND for a missing path", async () => {
    const result = await resolveInput("/nonexistent/nope.jpg");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INPUT_NOT_FOUND");
  });

  it("fetches http URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(Buffer.from([9, 8, 7]))),
    );
    const result = await resolveInput("https://example.com/photo.jpg");
    expect(result.success).toBe(true);
    if (result.success) expect(Array.from(result.data)).toEqual([9, 8, 7]);
  });

  it("returns INPUT_FETCH_FAILED on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    const result = await resolveInput("https://example.com/photo.jpg");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("INPUT_FETCH_FAILED");
      expect(result.error.message).toContain("404");
    }
  });

  it("returns INPUT_FETCH_FAILED on network errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const result = await resolveInput("https://example.com/photo.jpg");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INPUT_FETCH_FAILED");
  });
});

describe("inputStem", () => {
  it("strips directory and extension from paths", () => {
    expect(inputStem("./photos/vin-diesel.jpg")).toBe("vin-diesel");
  });

  it("uses the URL pathname basename, ignoring the query", () => {
    expect(inputStem("https://x.com/a/b.jpeg?w=1")).toBe("b");
  });

  it("falls back to 'stipple' for extensionless empty stems", () => {
    expect(inputStem("https://x.com/")).toBe("stipple");
  });
});
