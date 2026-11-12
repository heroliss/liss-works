#!/usr/bin/env python3
"""Create lossy full-width "display" copies of large lossless screenshots.

The lossless originals stay untouched and remain the lightbox / 打开大图 target.
Pages use `<stem>-display.webp` as the widest srcset candidate instead, so a
desktop browser no longer downloads a multi-megabyte lossless file for a card.
Writes src/data/display-media.json, read by src/data/project-image.ts.

Run from site/: python scripts/prepare-display-media.py
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

from PIL import Image

SITE = Path(__file__).resolve().parents[1]
MEDIA = SITE / 'public' / 'media'
OUTPUT = SITE / 'src' / 'data' / 'display-media.json'
VARIANT = re.compile(r'-(\d+|display)$')
MIN_BYTES = 250 * 1024
MIN_WIDTH = 961
QUALITY = 88
KEEP_RATIO = 0.7  # Only keep a display copy that saves at least 30 %.


def main() -> None:
    entries = {}
    for path in sorted(MEDIA.rglob('*.webp')):
        if VARIANT.search(path.stem):
            continue
        url = '/' + path.relative_to(SITE / 'public').as_posix()
        with Image.open(path) as opened:
            width, height = opened.size
            has1600 = (path.with_name(f'{path.stem}-1600.webp')).exists()
            entry = {'width': width, 'has1600': has1600}
            if width >= MIN_WIDTH and path.stat().st_size >= MIN_BYTES:
                target = path.with_name(f'{path.stem}-display.webp')
                opened.convert('RGB').save(target, format='WEBP', quality=QUALITY, method=6)
                if target.stat().st_size <= path.stat().st_size * KEEP_RATIO:
                    entry.update(display=url.replace('.webp', '-display.webp'), bytes=target.stat().st_size,
                                 originalBytes=path.stat().st_size,
                                 sha256=hashlib.sha256(target.read_bytes()).hexdigest())
                else:
                    target.unlink()
        if has1600 or 'display' in entry:
            entries[url] = entry
    OUTPUT.write_text(json.dumps({'quality': QUALITY, 'images': entries}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    saved = sum(e['originalBytes'] - e['bytes'] for e in entries.values() if 'display' in e)
    print(f"display copies: {sum('display' in e for e in entries.values())}, "
          f"1600 variants: {sum(e['has1600'] for e in entries.values())}, saved {saved / 1048576:.1f} MB per full set")


if __name__ == '__main__':
    main()
