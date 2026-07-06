import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultModelPath, ensureModel } from "../../src/infra/model-cache";

let cacheDir: string;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "stippler-cache-"));
  vi.stubEnv("XDG_CACHE_HOME", cacheDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("defaultModelPath", () => {
  it("honours XDG_CACHE_HOME", () => {
    expect(defaultModelPath()).toBe(join(cacheDir, "stippler", "u2net.onnx"));
  });
});

describe("ensureModel", () => {
  it("rejects an explicit path that does not exist, without downloading", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await ensureModel({ modelPath: "/nope/u2net.onnx" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("MODEL_NOT_FOUND");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts an explicit path that exists", async () => {
    const path = join(cacheDir, "custom.onnx");
    await writeFile(path, "tiny");
    const result = await ensureModel({ modelPath: path });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(path);
  });

  it("downloads to the cache with progress and an atomic rename", async () => {
    // The size floor is 170 MB; a zeroed buffer of that size is cheap to
    // allocate and stream, so the success path is tested against the real
    // constant rather than a stubbed one.
    const big = new Uint8Array(170_000_001);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(big, { headers: { "content-length": String(big.length) } })),
    );
    const progress = vi.fn();
    const result = await ensureModel({ onProgress: progress });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(defaultModelPath());
      const written = await readFile(result.data);
      expect(written.length).toBe(big.length);
    }
    expect(progress).toHaveBeenCalled();
    const lastCall = progress.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe(big.length);
  });

  it("rejects truncated downloads and cleans up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(1000))),
    );
    const result = await ensureModel({});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("MODEL_DOWNLOAD_FAILED");
  });

  it("reports HTTP failures as MODEL_DOWNLOAD_FAILED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 500 })),
    );
    const result = await ensureModel({});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain("500");
  });
});
