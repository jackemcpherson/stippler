"""Convert portrait photos to WSJ-hedcut-style stipple SVGs.

Weighted Voronoi stippling (Secord 2002): dots are seeded by darkness,
then relaxed with Lloyd iterations so spacing stays even while density
follows tone. An oval vignette fades the portrait out toward the edges,
giving every head the same bust-crop silhouette regardless of source
photo framing.

Usage:
    uv run python stipple.py [slug ...]        # default: all in celebs.py
    uv run python stipple.py --dots 2400 slug
"""

import argparse
import json
import logging
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps
from scipy.spatial import cKDTree

from celebs import CELEBS

W, H = 360, 432  # working canvas & SVG viewBox
INK = "#1a1a1a"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("stipple")


def load_crop(slug: str) -> tuple[float, float, float, float]:
    """Fractional crop box [x0, y0, x1, y1] for a slug, default top-center."""
    crops = {}
    path = Path("crops.json")
    if path.exists():
        crops = json.loads(path.read_text())
    if slug in crops:
        return tuple(crops[slug])
    return (0.5 - 0.375, 0.02, 0.5 + 0.375, 0.92)


def density_map(slug: str, gamma: float, edge_boost: float) -> np.ndarray:
    """Darkness-driven density in [0,1], vignetted to an oval bust."""
    src = Path(f"cutouts/{slug}.jpg")
    if src.exists():
        # cutout.py already applied crop, matting, and head-normalized framing
        im = Image.open(src).convert("L")
    else:
        im = Image.open(f"photos/{slug}.jpg").convert("L")
        w, h = im.size
        x0, y0, x1, y1 = load_crop(slug)
        im = im.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))
    # match target aspect by padding with white rather than distorting
    im = ImageOps.pad(im, (W, H), color=255, centering=(0.5, 0.35))
    im = ImageOps.autocontrast(im, cutoff=1)

    lum = np.asarray(im, dtype=np.float64) / 255.0
    dark = (1.0 - lum) ** gamma

    edges = im.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(1))
    edge = np.asarray(edges, dtype=np.float64) / 255.0
    d = np.clip(dark + edge_boost * edge, 0.0, 1.0)

    yy, xx = np.mgrid[0:H, 0:W]
    ex = (xx / W - 0.5) / 0.5
    ey = (yy / H - 0.46) / 0.52
    r = np.sqrt(ex**2 + ey**2)
    vignette = np.clip((1.14 - r) / 0.14, 0.0, 1.0)  # soft oval falloff
    d *= vignette
    d[d < 0.01] = 0.0
    return d


def stipple(d: np.ndarray, n_dots: int, iters: int, rng: np.random.Generator):
    """Weighted Voronoi relaxation. Returns (points, darkness_at_point)."""
    flat = d.ravel()
    total = flat.sum()
    if total <= 0:
        raise ValueError("empty density map")
    probs = flat / total
    idx = rng.choice(flat.size, size=n_dots, replace=False, p=probs)
    pts = np.column_stack([idx % W, idx // W]).astype(np.float64)
    pts += rng.uniform(-0.5, 0.5, pts.shape)

    ys, xs = np.nonzero(d > 0)
    pix = np.column_stack([xs, ys]).astype(np.float64)
    wts = d[ys, xs]

    for _ in range(iters):
        tree = cKDTree(pts)
        _, owner = tree.query(pix, workers=-1)
        wsum = np.bincount(owner, weights=wts, minlength=n_dots)
        cx = np.bincount(owner, weights=wts * pix[:, 0], minlength=n_dots)
        cy = np.bincount(owner, weights=wts * pix[:, 1], minlength=n_dots)
        moved = wsum > 0
        pts[moved, 0] = cx[moved] / wsum[moved]
        pts[moved, 1] = cy[moved] / wsum[moved]

    xi = np.clip(pts[:, 0].round().astype(int), 0, W - 1)
    yi = np.clip(pts[:, 1].round().astype(int), 0, H - 1)
    dark = d[yi, xi]
    keep = dark > 0.02
    return pts[keep], dark[keep]


def write_svg(slug: str, pts: np.ndarray, dark: np.ndarray, out_dir: Path) -> Path:
    """Encode dots as a few round-cap stroke paths, bucketed by radius.

    One h.01 micro-segment per dot is ~3x smaller than a <circle> element,
    and bucketing radii into 6 classes keeps the file to a handful of paths.
    """
    radii = 0.5 + 1.55 * dark**0.85
    spread = radii.max() - radii.min()
    buckets = np.clip(((radii - radii.min()) / (spread + 1e-9) * 6).astype(int), 0, 5)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img">',
    ]
    for b in range(6):
        sel = buckets == b
        if not sel.any():
            continue
        width = 2 * radii[sel].mean()
        d_attr = "".join(f"M{x:.1f} {y:.1f}h.01" for x, y in pts[sel])
        parts.append(
            f'<path stroke="{INK}" stroke-width="{width:.2f}" '
            f'stroke-linecap="round" fill="none" d="{d_attr}"/>'
        )
    parts.append("</svg>")
    out = out_dir / f"{slug}.svg"
    out.write_text("\n".join(parts))
    return out


def render_preview(pts: np.ndarray, dark: np.ndarray, scale: int = 2) -> Image.Image:
    im = Image.new("L", (W * scale, H * scale), 255)
    drw = ImageDraw.Draw(im)
    radii = (0.5 + 1.55 * dark**0.85) * scale
    for (x, y), r in zip(pts * scale, radii):
        drw.ellipse([x - r, y - r, x + r, y + r], fill=26)
    return im


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs", nargs="*", default=list(CELEBS))
    ap.add_argument("--dots", type=int, default=2200)
    ap.add_argument("--iters", type=int, default=45)
    ap.add_argument("--gamma", type=float, default=1.3)
    ap.add_argument("--edge-boost", type=float, default=0.3)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    out_dir = Path("svg")
    out_dir.mkdir(exist_ok=True)
    prev_dir = Path("preview")
    prev_dir.mkdir(exist_ok=True)

    for slug in args.slugs or list(CELEBS):
        rng = np.random.default_rng(args.seed)
        d = density_map(slug, args.gamma, args.edge_boost)
        pts, dark = stipple(d, args.dots, args.iters, rng)
        out = write_svg(slug, pts, dark, out_dir)
        render_preview(pts, dark).save(prev_dir / f"{slug}.png")
        log.info("%s: %d dots -> %s (%.0f KB)", slug, len(pts), out,
                 out.stat().st_size / 1024)


if __name__ == "__main__":
    main()
