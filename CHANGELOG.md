# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-06

Initial release.

### Added

- `stippler` CLI: WSJ-hedcut-style stipple portraits from a photo path or URL,
  output as compact SVG or PNG (`-o out.png`), with tuning flags for dots,
  iterations, gamma, edge boost, seed, ink colour, scale, and fractional crop.
- U2Net background removal and head-normalised framing (`--no-cutout` to skip),
  with a one-time model download to `~/.cache/stippler/u2net.onnx` that aborts
  cleanly and cleans up its temp file if the run fails.
- Weighted Voronoi stippling (Secord 2002): darkness-seeded sampling, Lloyd
  relaxation, and radius-bucketed SVG output (~35 KB raw per head).
- Library API: `generateHedcut(image, options)` returning a `Result`, with no
  filesystem or network access beyond reading the ONNX model at
  `options.modelPath`.
- EXIF orientation handling, deterministic output for a fixed seed, and typed
  errors (`StipplerError`) throughout.

[0.1.0]: https://github.com/jackemcpherson/stippler/releases/tag/v0.1.0
