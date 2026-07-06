# hedcut

WSJ-hedcut-style stipple portraits from Wikimedia Commons photos, for the
[Bald Man Scale](https://jackemcpherson.com/posts/bald-man-scale) post.

## Pipeline

```sh
uv run python fetch.py     # download lead portraits + licenses -> photos/, credits.json
uv run python cutout.py    # U2Net background removal -> cutouts/
uv run python stipple.py --gamma 1.45 --edge-boost 0.4   # weighted Voronoi stipple -> svg/, preview/
```

- `celebs.py` — slug → Wikipedia article title roster.
- `crops.json` — per-photo fractional crop boxes (eyeballed overrides).
- `credits.json` — source file, artist, and license per subject; feeds the
  post's Appendix A. Only CC / public-domain images are accepted.
- Output SVGs encode dots as six round-cap stroke paths bucketed by radius
  (~34 KB raw, ~11 KB gzipped per head).

Photos, cutouts, and the U2Net model are gitignored; regenerate with the
commands above.
