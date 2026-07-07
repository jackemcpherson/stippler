# stippler

TypeScript CLI and library that converts photos into WSJ-hedcut-style stipple portraits and emits compact SVGs.

## Commands

| Command            | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| `bun install`      | Install dependencies                                 |
| `bun run test`     | Run vitest (append `-- --run` for a single pass)     |
| `bun run check`    | Biome lint + format check                            |
| `bun run format`   | Biome format (write)                                 |
| `bun run typecheck`| `tsc --noEmit`                                       |
| `bun run build`    | bunup (types) + esbuild via `build.ts` (dist)        |

Runtime: TypeScript ESM, Node ≥ 20, dev tooling via bun.

## Layout

```
src/
  cli.ts          — citty entry point; top-level orchestration
  cli/            — flag parsing (zod), output path resolution
  core/           — pipeline math (pure, no I/O) + pipeline.ts orchestrator
  infra/          — sharp, onnxruntime, fs, network
  lib/            — Result type, StipplerError, seeded PRNG
  types.ts        — domain types, canvas constants, DEFAULT_OPTIONS
  index.ts        — public library surface
test/             — mirrors src/ layout
```

Purity boundary: `core/`'s math modules (density, stipple, svg, head-frame, matte-math, raster) are pure and I/O-free. `core/pipeline.ts` is the orchestrator and the only core file that touches infra adapters (`src/core/pipeline.ts:1` static image import, `:84` dynamic matte import). Keep new I/O out of the math modules.

## Conventions

- Fallible functions return `Result<T, StipplerError>` (`src/lib/result.ts`). `StipplerError.code` is a closed union defined in `src/lib/errors.ts`.
- `src/core/` throws `StipplerError` internally; `generateHedcut` catches and converts to `Result` at `src/core/pipeline.ts:130-134`.
- JSDoc on all exported symbols; Biome for formatting; conventional commits (see `git log`).

## Constraints (read before refactoring)

**Porting constraint.** `src/core/` is a line-faithful port of a Python/PIL/numpy pipeline. Functions deliberately reproduce PIL semantics: Rec.601 integer luma at `src/core/density.ts:11-22`, `ImageOps.autocontrast` histogram trimming at `src/core/density.ts:45-73`, and `Math.trunc` wherever Python used `int()` (`src/core/head-frame.ts`, `src/core/raster.ts`). Do not simplify the math or swap in sharp's built-ins such as `greyscale()` — they compute different transforms and will silently break output fidelity.

**sharp single-channel gotcha.** sharp expands 1-channel raw input to 3 channels during processing. `toGray` in `src/infra/image.ts:35-44` forces output back with `extractChannel(0)` and guards `info.channels !== 1`. Do not remove that guard or the channel force.

**Determinism contract.** The same seed must produce a byte-identical SVG. The PRNG is mulberry32 (`src/lib/random.ts`). Any change that reorders RNG draws — including innocent-looking loop restructures — breaks the contract. `test/e2e.test.ts` asserts byte identity and will catch regressions.

## Model & tests

u2net.onnx (~176 MB) auto-downloads to `$XDG_CACHE_HOME/stippler/u2net.onnx` (default `~/.cache/stippler/`) when the CLI is invoked. Library callers (`generateHedcut`) must supply `modelPath` themselves — the library never downloads the model.

The cutout e2e test is gated behind `STIPPLER_MODEL_PATH`: set it to a local u2net.onnx to enable that test.

## Releases & artifacts

Releases are tag-driven (`v*`). npm publishing uses OIDC trusted publishing defined in `.github/workflows/release.yml` — no stored token needed.

`svg/` and `credits.json` at the repo root are frozen outputs from the original blog post. Do not regenerate, lint, or delete them.
