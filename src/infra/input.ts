import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { StipplerError } from "../lib/errors";
import { err, ok, type Result } from "../lib/result";

function isHttpUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

/** Read the input image from a local path or a direct http(s) URL. */
export async function resolveInput(input: string): Promise<Result<Buffer, StipplerError>> {
  if (isHttpUrl(input)) {
    try {
      // Some hosts (e.g. Wikimedia) reject requests without a User-Agent.
      const response = await fetch(input, {
        headers: { "user-agent": "stippler (github.com/jackemcpherson/hedcut)" },
      });
      if (!response.ok) {
        return err(
          new StipplerError(
            "INPUT_FETCH_FAILED",
            `fetch failed: HTTP ${response.status} for ${input}`,
          ),
        );
      }
      return ok(Buffer.from(await response.arrayBuffer()));
    } catch (cause) {
      return err(new StipplerError("INPUT_FETCH_FAILED", `could not fetch ${input}`, { cause }));
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
