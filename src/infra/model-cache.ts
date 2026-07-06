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
 * An explicit `modelPath` is trusted as-is and never triggers a download;
 * the default cache path is (re-)downloaded when missing or truncated.
 */
export async function ensureModel(opts: {
  modelPath?: string | undefined;
  onProgress?: (receivedBytes: number, totalBytes: number | null) => void;
  /** Aborts an in-flight download and cleans up its temp file. */
  signal?: AbortSignal | undefined;
}): Promise<Result<string, StipplerError>> {
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
    let received = 0;
    const progress = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
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
    await rename(temp, target);
    return ok(target);
  } catch (cause) {
    await unlink(temp).catch(() => {});
    return err(new StipplerError("MODEL_DOWNLOAD_FAILED", "model download failed", { cause }));
  }
}
