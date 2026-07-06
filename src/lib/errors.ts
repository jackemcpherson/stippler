/** Machine-readable failure categories surfaced through {@link StipplerError}. */
export type StipplerErrorCode =
  | "INVALID_FLAGS"
  | "INPUT_NOT_FOUND"
  | "INPUT_FETCH_FAILED"
  | "UNSUPPORTED_IMAGE"
  | "MODEL_DOWNLOAD_FAILED"
  | "MODEL_NOT_FOUND"
  | "MATTE_FAILED"
  | "EMPTY_DENSITY"
  | "OUTPUT_WRITE_FAILED";

/**
 * Domain error for all expected failure modes.
 *
 * The library returns these inside `Result.error`; the CLI switches on
 * {@link code} for user-facing messages. `instanceof StipplerError`
 * distinguishes expected failures from bugs.
 */
export class StipplerError extends Error {
  readonly code: StipplerErrorCode;

  constructor(code: StipplerErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StipplerError";
    this.code = code;
  }
}
