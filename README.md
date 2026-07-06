# stippler

WSJ-hedcut-style stipple portraits from photos, as compact SVGs.

Weighted Voronoi stippling (Secord 2002): dots are seeded by darkness, then
relaxed with Lloyd iterations so spacing stays even while density follows
tone. U2Net background removal and head-normalised framing give every
portrait the same bust-crop silhouette, and an oval vignette fades it out
toward the edges.

Originally a Python pipeline built for the
[Bald Man Scale](https://jackemcpherson.com/posts/bald-man-scale) post — the
24 SVGs it published live in [`svg/`](svg/), with per-subject attribution in
[`credits.json`](credits.json).

## Install

```sh
npm install -g stippler   # or: npx stippler photo.jpg
```

Requires Node 20+. `sharp` and `onnxruntime-node` ship native binaries for
macOS (arm64/x64), Linux (x64/arm64 glibc), and Windows x64; Alpine/musl is
unsupported. On first run with background removal, the u2net model (~176 MB)
downloads once to `~/.cache/stippler/u2net.onnx`.

## Usage

```sh
stippler photo.jpg                         # -> photo.svg
stippler https://example.com/face.jpg      # URLs work too
stippler photo.jpg -o out.png --scale 3    # extension picks the format
stippler photo.jpg --crop 0.2,0,0.8,0.9    # fractional pre-crop for awkward framing
stippler photo.jpg --no-cutout             # skip U2Net; plain top-centre crop
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `-o, --out` | `<input>.svg` | Output path; `.svg` or `.png` decides the format |
| `--dots` | 2200 | Number of stipple dots |
| `--iters` | 45 | Lloyd relaxation iterations |
| `--gamma` | 1.45 | Darkness exponent; higher concentrates dots in shadows |
| `--edge-boost` | 0.4 | Edge-detection contribution to dot density |
| `--seed` | 7 | PRNG seed; same seed, same output |
| `--ink` | `#1a1a1a` | Dot colour (hex) |
| `--scale` | 2 | PNG scale factor over the 360x432 canvas |
| `--crop` | — | Fractional pre-crop `x0,y0,x1,y1` in [0, 1] |
| `--no-cutout` | — | Skip background removal and head framing |
| `--model-path` | auto | Explicit u2net.onnx path (never downloads) |

EXIF orientation is applied automatically, so phone photos come out upright.
Output SVGs encode dots as six round-cap stroke paths bucketed by radius
(~35 KB raw, ~11 KB gzipped per head).

## Library

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { generateHedcut } from "stippler";

const result = await generateHedcut(await readFile("photo.jpg"), {
  dots: 2400,
  modelPath: "/path/to/u2net.onnx", // omit with cutout: false
});
if (result.success) {
  await writeFile("out.svg", result.data.svg);
}
```

`generateHedcut` performs no filesystem or network access beyond reading the
model file — input acquisition, model download, and output writing stay with
the caller (the CLI handles all three).

## Development

```sh
bun install
bun run test        # vitest
bun run check       # biome lint + format
bun run typecheck   # tsc --noEmit
bun run build       # bunup (types) + esbuild (dist/)
```

The cutout end-to-end test is gated: set `STIPPLER_MODEL_PATH` to a local
u2net.onnx to include it. Releases are tag-driven (`v*`) and publish to npm
via OIDC trusted publishing — see `.github/workflows/release.yml`.
