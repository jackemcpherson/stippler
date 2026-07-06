"""Fetch lead portrait images from Wikipedia/Wikimedia Commons.

For each subject, resolves the Wikipedia lead image, checks that its
license permits derivatives (CC or public domain), downloads a 1280px
rendition to photos/<slug>.jpg, and records attribution in credits.json.
"""

import html
import json
import logging
import re
import sys
from pathlib import Path

import requests

from celebs import CELEBS

API = "https://en.wikipedia.org/w/api.php"
HEADERS = {
    "User-Agent": "hedcut-pipeline/0.1 (jackemcpherson@gmail.com; personal art project)"
}
FREE_LICENSE = re.compile(r"(CC|Public domain|No restrictions)", re.IGNORECASE)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("fetch")


def lead_image_name(session: requests.Session, title: str) -> str | None:
    """Return the lead image file name for a Wikipedia article."""
    resp = session.get(
        API,
        params={
            "action": "query",
            "titles": title,
            "prop": "pageimages",
            "piprop": "name",
            "format": "json",
            "redirects": 1,
        },
        timeout=30,
    )
    resp.raise_for_status()
    pages = resp.json()["query"]["pages"]
    for page in pages.values():
        if "pageimage" in page:
            return page["pageimage"]
    return None


def image_info(session: requests.Session, file_name: str) -> dict | None:
    """Return url + attribution metadata for a Commons file."""
    resp = session.get(
        API,
        params={
            "action": "query",
            "titles": f"File:{file_name}",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": 1280,
            "format": "json",
        },
        timeout=30,
    )
    resp.raise_for_status()
    pages = resp.json()["query"]["pages"]
    for page in pages.values():
        infos = page.get("imageinfo")
        if infos:
            return infos[0]
    return None


def strip_tags(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", text)).strip()


def main() -> None:
    out_dir = Path("photos")
    out_dir.mkdir(exist_ok=True)
    credits: dict[str, dict] = {}
    session = requests.Session()
    session.headers.update(HEADERS)

    only = set(sys.argv[1:])
    failures: list[str] = []

    for slug, title in CELEBS.items():
        if only and slug not in only:
            continue
        try:
            file_name = lead_image_name(session, title)
            if not file_name:
                raise RuntimeError("no lead image")
            info = image_info(session, file_name)
            if not info:
                raise RuntimeError("no imageinfo")
            meta = info.get("extmetadata", {})
            license_name = meta.get("LicenseShortName", {}).get("value", "")
            if not FREE_LICENSE.search(license_name):
                raise RuntimeError(f"non-free license: {license_name!r}")
            artist = strip_tags(meta.get("Artist", {}).get("value", "unknown"))
            url = info.get("thumburl") or info["url"]

            img = session.get(url, timeout=60)
            img.raise_for_status()
            dest = out_dir / f"{slug}.jpg"
            dest.write_bytes(img.content)

            credits[slug] = {
                "title": title,
                "file": file_name,
                "artist": artist,
                "license": license_name,
                "source": info["descriptionurl"],
            }
            log.info("%s <- %s [%s] by %s", slug, file_name, license_name, artist)
        except Exception as exc:  # noqa: BLE001 - report and continue
            failures.append(slug)
            log.warning("%s FAILED: %s", slug, exc)

    existing = {}
    credits_path = Path("credits.json")
    if credits_path.exists():
        existing = json.loads(credits_path.read_text())
    existing.update(credits)
    credits_path.write_text(json.dumps(existing, indent=2) + "\n")

    if failures:
        log.warning("failed: %s", ", ".join(failures))
    log.info("done: %d fetched, %d failed", len(credits), len(failures))


if __name__ == "__main__":
    main()
