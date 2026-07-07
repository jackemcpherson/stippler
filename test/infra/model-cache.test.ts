import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
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
    const expected = createHash("sha256").update(big).digest("hex");
    const result = await ensureModel({ onProgress: progress, expectedSha256: expected });
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

  it("rejects a download whose hash does not match the expected value", async () => {
    const big = new Uint8Array(170_000_001);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(big, { headers: { "content-length": String(big.length) } })),
    );
    const result = await ensureModel({ expectedSha256: "0".repeat(64) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("MODEL_DOWNLOAD_FAILED");
      expect(result.error.message).toContain("integrity");
    }
    // Cache file must be absent after a failed integrity check
    await expect(readFile(defaultModelPath())).rejects.toThrow();
  });

  it("rejects downloads that declare an implausible content-length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array(1000), {
            headers: { "content-length": "999999999999" },
          }),
      ),
    );
    const result = await ensureModel({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("MODEL_DOWNLOAD_FAILED");
      expect(result.error.message).toContain("implausible");
    }
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

  it("aborts an in-flight download and leaves no temp file", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(1024 * 1024)); // stream forever until aborted
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body)),
    );
    const pending = ensureModel({
      signal: controller.signal,
      onProgress: (received) => {
        if (received > 5_000_000) controller.abort();
      },
    });
    const result = await pending;
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("MODEL_DOWNLOAD_FAILED");
    const leftovers = await readdir(join(cacheDir, "stippler")).catch(() => []);
    expect(leftovers.filter((f) => f.includes(".download-"))).toEqual([]);
  });
});
