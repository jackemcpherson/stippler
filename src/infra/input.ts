import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { StipplerError } from "../lib/errors";
import { err, ok, type Result } from "../lib/result";

/** Abort URL input fetches that take longer than this (milliseconds). */
const FETCH_TIMEOUT_MS = 30_000;

/** Reject URL input responses larger than this (bytes). */
const INPUT_MAX_BYTES = 64 * 1024 * 1024;

function isHttpUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

/** Read the input image from a local path or a direct http(s) URL. */
export async function resolveInput(
  input: string,
  limits: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<Result<Buffer, StipplerError>> {
  const timeoutMs = limits.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = limits.maxBytes ?? INPUT_MAX_BYTES;
  if (isHttpUrl(input)) {
    try {
      // Some hosts (e.g. Wikimedia) reject requests without a User-Agent.
      const response = await fetch(input, {
        headers: { "user-agent": "stippler (github.com/jackemcpherson/stippler)" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        return err(
          new StipplerError(
            "INPUT_FETCH_FAILED",
            `fetch failed: HTTP ${response.status} for ${input}`,
          ),
        );
      }
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) {
        await response.body?.cancel().catch(() => {});
        return err(
          new StipplerError(
            "INPUT_FETCH_FAILED",
            `response too large (${declared} bytes, limit ${maxBytes}) for ${input}`,
          ),
        );
      }
      if (response.body === null) {
        return ok(Buffer.alloc(0));
      }
      const chunks: Uint8Array[] = [];
      let received = 0;
      let overflowed = false;
      for await (const chunk of response.body) {
        received += chunk.length;
        if (received > maxBytes) {
          overflowed = true;
          break;
        }
        chunks.push(chunk);
      }
      if (overflowed) {
        return err(
          new StipplerError(
            "INPUT_FETCH_FAILED",
            `response exceeded ${maxBytes} bytes for ${input}`,
          ),
        );
      }
      return ok(Buffer.concat(chunks));
    } catch (cause) {
      const msg =
        cause instanceof Error && cause.name === "TimeoutError"
          ? `timed out fetching ${input}`
          : `could not fetch ${input}`;
      return err(new StipplerError("INPUT_FETCH_FAILED", msg, { cause }));
    }
  }
  try {
    return ok(await readFile(input));
  } catch (cause) {
    return err(new StipplerError("INPUT_NOT_FOUND", `could not read ${input}`, { cause }));
  }
}

/** Basename without extension, used for the default output filename. */
export function inputStem(input: string): string {
  let name: string;
  if (isHttpUrl(input)) {
    try {
      name = basename(new URL(input).pathname);
    } catch {
      name = "";
    }
  } else {
    name = basename(input);
  }
  const stem = name.slice(0, name.length - extname(name).length);
  return stem.length > 0 ? stem : "stipple";
}
