#!/usr/bin/env python3
"""Export traceable local website media. Originals are never modified.

Requires existing Pillow and fontTools. If the Python Brotli extension is absent,
fontTools' WOFF2 codec uses Node's bundled Brotli implementation; nothing is
installed and the font output is decoded again to verify it.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import types
import urllib.request

from PIL import Image, ImageChops

SITE = Path(__file__).resolve().parents[1]
WORKSPACE = SITE.parent
PUBLIC = SITE / "public"
MANIFEST = WORKSPACE / "captures/selected-manifest.json"
ADDITIONS = SITE / "media-additions.json"
REPORT = SITE / "media-provenance.json"
SIZES = (320, 640, 960, 1600)
GAME_REPOS = {"outpost", "nomadworkshop", "learnopengl"}
NOTO_LICENSE_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(WORKSPACE).as_posix()


def record(path: Path, **details: object) -> dict:
    return {"path": relative(path), "url": "/" + path.relative_to(PUBLIC).as_posix(),
            "bytes": path.stat().st_size, "sha256": sha256(path), **details}


def webp_metadata(path: Path, **details: object) -> dict:
    with Image.open(path) as image:
        image.load()
        assert image.format == "WEBP", path
        return record(path, width=image.width, height=image.height, **details)


def export_image(item: dict) -> dict:
    source = WORKSPACE / item["source"]
    source_hash = sha256(source)
    assert source_hash == item["source_sha256"], f"Source changed: {source}"
    out_dir = PUBLIC / "media" / item["repo"].lower()
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = source.stem
    with Image.open(source) as opened:
        opened.load()
        image = opened.convert("RGB")
    assert image.size == (item["width"], item["height"]), source
    lossless = item["repo"].lower() not in GAME_REPOS
    output = out_dir / f"{stem}.webp"
    image.save(output, format="WEBP", lossless=lossless, quality=92, method=6)
    if lossless:
        with Image.open(output) as decoded:
            assert ImageChops.difference(image, decoded.convert("RGB")).getbbox() is None
    variants = []
    for width in SIZES:
        if image.width <= width:
            continue
        height = max(1, round(image.height * width / image.width))
        small = image.resize((width, height), Image.Resampling.LANCZOS)
        target = out_dir / f"{stem}-{width}.webp"
        small.save(target, format="WEBP", quality=92, method=6)
        variants.append(webp_metadata(target, codec="webp", quality=92, lossless=False))
    assert sha256(source) == source_hash, f"Source modified: {source}"
    return {"repo": item["repo"], "source": relative(source), "source_sha256": source_hash,
            "source_bytes": source.stat().st_size, "source_width": image.width,
            "source_height": image.height, "source_authenticity": item.get("authenticity"),
            "crop": False, "upscaled": False,
            "full": webp_metadata(output, codec="webp", quality=92, lossless=lossless),
            "variants": variants}


def enable_brotli_for_fonttools() -> str:
    try:
        __import__("brotli")
        return "Python Brotli extension"
    except ImportError:
        pass
    try:
        __import__("brotlicffi")
        return "Python brotlicffi extension"
    except ImportError:
        pass
    node = shutil.which("node")
    if not node:
        raise RuntimeError("WOFF2 needs Brotli: neither Python Brotli nor Node is available")
    bridge = types.ModuleType("brotli")
    bridge.MODE_FONT = 2

    def codec(data: bytes, compress: bool) -> bytes:
        code = ("const fs=require('node:fs'),z=require('node:zlib');"
                "const b=fs.readFileSync(0);"
                + ("process.stdout.write(z.brotliCompressSync(b,{params:{"
                   "[z.constants.BROTLI_PARAM_MODE]:z.constants.BROTLI_MODE_FONT,"
                   "[z.constants.BROTLI_PARAM_QUALITY]:11}}));" if compress else
                   "process.stdout.write(z.brotliDecompressSync(b));"))
        return subprocess.run([node, "-e", code], input=data, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, check=True).stdout

    bridge.compress = lambda data, **kwargs: codec(data, True)
    bridge.decompress = lambda data: codec(data, False)
    sys.modules["brotli"] = bridge
    return "Node native zlib Brotli (quality 11 / font mode), invoked by fontTools"


def export_fonts() -> dict:
    brotli = enable_brotli_for_fonttools()
    from fontTools import subset
    from fontTools.ttLib import TTFont

    out = PUBLIC / "fonts"
    out.mkdir(parents=True, exist_ok=True)
    rajdhani = WORKSPACE / "design/v3/assets/Rajdhani-SemiBold.ttf"
    rajdhani_license = WORKSPACE / "design/v3/assets/Rajdhani-OFL.txt"
    shutil.copy2(rajdhani_license, out / "Rajdhani-OFL.txt")
    noto = Path("C:/Windows/Fonts/NotoSansSC-VF.ttf")
    noto_license = out / "NotoSansSC-OFL.txt"
    if not noto_license.exists():
        with urllib.request.urlopen(NOTO_LICENSE_URL, timeout=45) as response:
            noto_license.write_bytes(response.read())
    assert "SIL OPEN FONT LICENSE Version 1.1" in " ".join(noto_license.read_text(encoding="utf-8").split())
    source_font = TTFont(noto)
    original_names = {str(i): sorted({n.toUnicode() for n in source_font["name"].names
                                     if n.nameID == i}) for i in (0, 1, 2, 5, 13, 14)}
    assert "SIL Open Font License" in " ".join(original_names["13"])
    source_font.close()

    # Include all current rendered content plus the approved concept and capture
    # descriptions. Re-run this command whenever site copy gains new characters.
    content_sources = [MANIFEST, WORKSPACE / "design/v3/index.html"]
    content_sources += sorted(p for p in (SITE / "src").rglob("*")
                              if p.is_file() and p.suffix in {".astro", ".ts", ".js", ".json", ".css", ".md"})
    text = "".join(chr(i) for i in range(0x20, 0x7f)) + "\u3000、。〈〉《》「」『』【】〔〕〜·—–…‘’“”！？：；（）＋−×÷→←↑↓↗↘✓●○◌◉①②③④⑤⑥"
    text += "".join(p.read_text(encoding="utf-8") for p in content_sources if p.exists())
    unique = {ord(c) for c in text if not c.isspace()}
    unique.update((0x20, 0xA0))

    font_records = []
    for input_font, filename, chars, family in (
        (rajdhani, "rajdhani-semibold.woff2", set(range(0x20, 0x100)), "Rajdhani"),
        (noto, "noto-sans-sc-subset.woff2", unique, "Noto Sans SC"),
    ):
        font = TTFont(input_font, recalcTimestamp=False)
        cmap = font.getBestCmap()
        supported = set(cmap)
        options = subset.Options()
        options.name_IDs = ["*"]
        options.name_legacy = True
        options.name_languages = ["*"]
        options.layout_features = ["*"]
        options.recalc_timestamp = False
        sub = subset.Subsetter(options=options)
        sub.populate(unicodes=chars & supported)
        sub.subset(font)
        font.flavor = "woff2"
        target = out / filename
        font.save(target)
        font.close()
        verification = TTFont(target)
        actual = set(verification.getBestCmap())
        assert not ((chars & supported) - actual), "Font export lost requested supported glyphs"
        verification.close()
        missing_cjk = sorted(c for c in chars - supported if 0x3400 <= c <= 0x9fff)
        assert not missing_cjk, f"Missing CJK glyphs: {missing_cjk}"
        font_records.append(record(target, family=family, source=str(input_font),
                                   source_sha256=sha256(input_font), source_bytes=input_font.stat().st_size,
                                   requested_codepoints=len(chars), included_codepoints=len(actual),
                                   missing_cjk=[], roundtrip_decode_verified=True))
    result = {"codec": "fontTools WOFF2 with " + brotli,
              "content_sources": [relative(p) for p in content_sources if p.exists()],
              "noto_original_metadata": original_names, "noto_license_source": NOTO_LICENSE_URL,
              "font_files": font_records,
              "license_files": [record(out / "Rajdhani-OFL.txt"), record(noto_license)],
              "refresh_rule": "Re-run prepare-media.py --fonts-only after adding website copy; only supported current glyphs are included."}
    (out / "FONT-SOURCES.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--media-only", action="store_true")
    parser.add_argument("--fonts-only", action="store_true")
    parser.add_argument("--repo", action="append", help="Re-export one repository's images and retain verified exports for the others; repeatable.")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    if args.media_only and args.fonts_only:
        parser.error("Choose one export scope or omit both to export everything")
    if args.repo and args.fonts_only:
        parser.error("--repo applies to image exports, not --fonts-only")
    existing = json.loads(REPORT.read_text(encoding="utf-8")) if REPORT.exists() else {}
    result = {**existing, "schema": "showcase.website-media.v1",
              "generated_at_utc": datetime.now(timezone.utc).isoformat(),
              "source_manifest": relative(MANIFEST), "source_manifest_sha256": sha256(MANIFEST),
              "originals_modified": False,
              "transform": "Full-image WebP encoding and Lanczos proportional downscaling only; no crop, no AI alterations, no upscaling."}
    # New-design additions are separate from the original site's capture list.
    manifests = [MANIFEST, *([ADDITIONS] if ADDITIONS.exists() else [])]
    result["source_manifests"] = [{"path": relative(path), "sha256": sha256(path)} for path in manifests]
    if not args.fonts_only:
        manifest = {"images": [item for path in manifests for item in json.loads(path.read_text(encoding="utf-8"))["images"]]}
        sources = [item["source"] for item in manifest["images"]]
        destinations = [(item["repo"].lower(), Path(item["source"]).stem) for item in manifest["images"]]
        assert len(sources) == len(set(sources)), "Duplicate source in capture manifests"
        assert len(destinations) == len(set(destinations)), "Duplicate exported media filename"
        selected = manifest["images"]
        retained = {}
        if args.repo:
            requested = {repo.casefold() for repo in args.repo}
            known = {item["repo"].casefold() for item in selected}
            if requested - known:
                parser.error("Unknown repository: " + ", ".join(sorted(requested - known)))
            selected = [item for item in selected if item["repo"].casefold() in requested]
            previous = {item["source"]: item for item in existing.get("images", [])}
            for item in manifest["images"]:
                if item["repo"].casefold() in requested:
                    continue
                old = previous.get(item["source"])
                assert old and old["source_sha256"] == item["source_sha256"] == sha256(WORKSPACE / item["source"]), "Run a full export first: " + item["source"]
                for output in [old["full"], *old["variants"]]:
                    assert sha256(WORKSPACE / output["path"]) == output["sha256"], "Export changed: " + output["path"]
                retained[item["source"]] = old
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            exported = list(executor.map(export_image, selected))
        by_source = {**retained, **{item["source"]: item for item in exported}}
        result["images"] = [by_source[item["source"]] for item in manifest["images"]]
        source_video = WORKSPACE / "captures/china-house-price-map/video/map-ui-native720.mp4"
        video = PUBLIC / "media/china-house-price-map/demo.mp4"
        shutil.copy2(source_video, video)
        assert sha256(source_video) == sha256(video)
        result["video"] = record(video, source=relative(source_video), source_sha256=sha256(source_video),
                                 exact_copy=True, width=1280, height=720,
                                 note="Real map UI capture, 19.133 s, encoded 30 CFR with frame duplication; not a rendering performance claim.")
    if not args.media_only:
        result["fonts"] = export_fonts()
    images = result.get("images", [])
    image_files = [f for item in images for f in [item["full"], *item["variants"]]]
    font_metadata = PUBLIC / "fonts/FONT-SOURCES.json"
    font_sidecars = [*result.get("fonts", {}).get("license_files", [])]
    if font_metadata.exists():
        font_sidecars.append(record(font_metadata))
    totals = {"original_image_count": len(images), "exported_image_count": len(image_files),
              "source_image_bytes": sum(i["source_bytes"] for i in images),
              "exported_image_bytes": sum(i["bytes"] for i in image_files),
              "video_bytes": result.get("video", {}).get("bytes", 0),
              "font_bytes": sum(i["bytes"] for i in result.get("fonts", {}).get("font_files", [])),
              "font_license_and_provenance_bytes": sum(i["bytes"] for i in font_sidecars)}
    totals["published_media_bytes"] = totals["exported_image_bytes"] + totals["video_bytes"] + totals["font_bytes"]
    totals["total_public_asset_count"] = (len(image_files) + bool(result.get("video"))
                                         + len(result.get("fonts", {}).get("font_files", []))
                                         + len(font_sidecars))
    totals["total_public_asset_bytes"] = totals["published_media_bytes"] + totals["font_license_and_provenance_bytes"]
    result["totals"] = totals
    REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    proof = WORKSPACE / "verification/site-next/media-export.json"
    proof.parent.mkdir(parents=True, exist_ok=True)
    proof.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(totals, ensure_ascii=False))


if __name__ == "__main__":
    main()
