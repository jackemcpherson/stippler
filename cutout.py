"""Remove photo backgrounds with U2Net so stipples see only the subject.

Downloads the u2net.onnx model once, then composites each cropped photo
onto white using the predicted alpha matte. Outputs to cutouts/<slug>.jpg,
which stipple.py prefers over photos/<slug>.jpg when present.
"""

import logging
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import requests
from PIL import Image

from celebs import CELEBS

MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"
MODEL_PATH = Path("models/u2net.onnx")

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("cutout")


def ensure_model() -> Path:
    if MODEL_PATH.exists():
        return MODEL_PATH
    MODEL_PATH.parent.mkdir(exist_ok=True)
    log.info("downloading u2net.onnx (~176 MB)...")
    with requests.get(MODEL_URL, stream=True, timeout=600) as resp:
        resp.raise_for_status()
        with open(MODEL_PATH, "wb") as fh:
            for chunk in resp.iter_content(1 << 20):
                fh.write(chunk)
    return MODEL_PATH


def alpha_matte(session: ort.InferenceSession, im: Image.Image) -> np.ndarray:
    """Predict a [0,1] foreground matte at the image's original size."""
    small = im.convert("RGB").resize((320, 320), Image.LANCZOS)
    arr = np.asarray(small, dtype=np.float32) / 255.0
    arr = (arr - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    inp = arr.transpose(2, 0, 1)[np.newaxis].astype(np.float32)
    name = session.get_inputs()[0].name
    pred = session.run(None, {name: inp})[0][0, 0]
    pred = (pred - pred.min()) / (pred.max() - pred.min() + 1e-9)
    matte = Image.fromarray((pred * 255).astype(np.uint8)).resize(im.size, Image.LANCZOS)
    return np.asarray(matte, dtype=np.float64) / 255.0


def head_frame(matte: np.ndarray) -> tuple[int, int, int, int]:
    """Head-normalized frame (left, top, width, height) from the matte.

    Measures head width in the top part of the subject and frames so every
    portrait has the crown at the same height and the head at the same scale.
    """
    solid = matte > 0.6
    rows = np.nonzero(solid.any(axis=1))[0]
    if rows.size == 0:
        h, w = matte.shape
        return 0, 0, w, h
    y0, y1 = rows[0], rows[-1]
    zone = solid[y0 : y0 + max(1, int(0.20 * (y1 - y0)))]
    widths = zone.sum(axis=1)
    head_w = int(np.percentile(widths, 80))
    ys, xs = np.nonzero(zone)
    cx = int(xs.mean())
    size = int(1.75 * head_w)
    left = cx - size // 2
    top = int(y0 - 0.1 * size)
    return left, top, size, int(1.2 * size)


def load_precrop(slug: str) -> tuple[float, float, float, float] | None:
    import json

    path = Path("crops.json")
    if path.exists():
        crops = json.loads(path.read_text())
        if slug in crops:
            return tuple(crops[slug])
    return None


def main() -> None:
    session = ort.InferenceSession(str(ensure_model()), providers=["CPUExecutionProvider"])
    out_dir = Path("cutouts")
    out_dir.mkdir(exist_ok=True)
    slugs = sys.argv[1:] or list(CELEBS)
    for slug in slugs:
        im = Image.open(f"photos/{slug}.jpg").convert("RGB")
        pre = load_precrop(slug)
        if pre:
            w, h = im.size
            im = im.crop((int(pre[0] * w), int(pre[1] * h), int(pre[2] * w), int(pre[3] * h)))
        matte2d = alpha_matte(session, im)
        matte = matte2d[..., np.newaxis]
        rgb = np.asarray(im, dtype=np.float64)
        comp = Image.fromarray((rgb * matte + 255.0 * (1.0 - matte)).astype(np.uint8))

        left, top, fw, fh = head_frame(matte2d)
        canvas = Image.new("RGB", (fw, fh), "white")
        # paste the composited image so that (left, top) lands at the origin
        canvas.paste(comp, (-left, -top))
        canvas.save(out_dir / f"{slug}.jpg", quality=92)
        log.info("%s: matte %.0f%%, frame %dx%d at (%d,%d)",
                 slug, 100 * matte.mean(), fw, fh, left, top)


if __name__ == "__main__":
    main()
