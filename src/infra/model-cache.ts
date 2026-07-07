import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { StipplerError } from "../lib/errors";
import { err, ok, type Result } from "../lib/result";

const MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx";

/** Sanity floor for a complete u2net.onnx (actual size ~176 MB). */
const MODEL_SIZE_MIN = 170_000_000;

/** Ceiling on the declared download size — reject absurd content-length early. */
const MODEL_SIZE_MAX = 200_000_000;

/** SHA-256 of the genuine u2net.onnx release asset. */
const MODEL_SHA256 = "8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491";

/** Default cache location: `$XDG_CACHE_HOME/stippler/u2net.onnx`. */
export function defaultModelPath(): string {
  const cacheRoot = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return join(cacheRoot, "stippler", "u2net.onnx");
}

async function fileSize(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).size;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a usable u2net.onnx path, downloading to the cache on first use.
 *
 * An explicit `modelPath` is trusted as-is and never triggers a download or
 * hash verification.
 *
 * An existing cache file ≥ `MODEL_SIZE_MIN` is trusted without re-hashing.
 * This is deliberate: the SHA-256 is verified once at download time, and
 * hashing a 176 MB file on every CLI invocation costs real startup time.
 *
 * Fresh downloads are verified against a pinned SHA-256 before the temp file
 * is renamed into the cache. The temp file is always unlinked on failure.
 */
export async function ensureModel(opts: {
  modelPath?: string | undefined;
  onProgress?: (receivedBytes: number, totalBytes: number | null) => void;
  /** Aborts an in-flight download and cleans up its temp file. */
  signal?: AbortSignal | undefined;
  /** Override the pinned model hash — for tests only. */
  expectedSha256?: string | undefined;
}): Promise<Result<string, StipplerError>> {
  const expectedSha256 = opts.expectedSha256 ?? MODEL_SHA256;

  if (opts.modelPath !== undefined) {
    const size = await fileSize(opts.modelPath);
    if (size === undefined) {
      return err(
        new StipplerError(
          "MODEL_NOT_FOUND",
          `model not found at ${opts.modelPath} (explicit paths are never downloaded)`,
        ),
      );
    }
    return ok(opts.modelPath);
  }

  const target = defaultModelPath();
  const existing = await fileSize(target);
  if (existing !== undefined && existing >= MODEL_SIZE_MIN) {
    return ok(target);
  }

  const temp = `${target}.download-${process.pid}`;
  try {
    await mkdir(dirname(target), { recursive: true });
    const response = await fetch(MODEL_URL, { signal: opts.signal ?? null });
    if (!response.ok || response.body === null) {
      return err(
        new StipplerError(
          "MODEL_DOWNLOAD_FAILED",
          `model download failed: HTTP ${response.status}`,
        ),
      );
    }
    const contentLength = response.headers.get("content-length");
    const total = contentLength === null ? null : Number(contentLength);
    if (total !== null && (!Number.isFinite(total) || total > MODEL_SIZE_MAX)) {
      await response.body?.cancel().catch(() => {});
      return err(
        new StipplerError(
          "MODEL_DOWNLOAD_FAILED",
          `model download declared implausible size (${contentLength} bytes)`,
        ),
      );
    }
    let received = 0;
    const hash = createHash("sha256");
    const progress = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > MODEL_SIZE_MAX) {
          callback(new Error("model download exceeded size ceiling"));
          return;
        }
        hash.update(chunk);
        opts.onProgress?.(received, total);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
      progress,
      createWriteStream(temp),
      opts.signal !== undefined ? { signal: opts.signal } : {},
    );
    const downloaded = await fileSize(temp);
    if (downloaded === undefined || downloaded < MODEL_SIZE_MIN) {
      await unlink(temp).catch(() => {});
      return err(
        new StipplerError(
          "MODEL_DOWNLOAD_FAILED",
          `model download truncated (${downloaded ?? 0} bytes)`,
        ),
      );
    }
    const digest = hash.digest("hex");
    if (digest !== expectedSha256) {
      await unlink(temp).catch(() => {});
      return err(
        new StipplerError(
          "MODEL_DOWNLOAD_FAILED",
          `model download failed integrity check (sha256 ${digest})`,
        ),
      );
    }
    await rename(temp, target);
    return ok(target);
  } catch (cause) {
    await unlink(temp).catch(() => {});
    return err(new StipplerError("MODEL_DOWNLOAD_FAILED", "model download failed", { cause }));
  }
}
