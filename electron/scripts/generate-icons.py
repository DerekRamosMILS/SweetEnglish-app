#!/usr/bin/env python3
"""
Generate assets/icon.icns from assets/icon.svg using Pillow + iconutil.
Run from the electron/ directory: python scripts/generate-icons.py
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Installing Pillow…")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow", "--quiet"])
    from PIL import Image

SCRIPT_DIR = Path(__file__).parent
ELECTRON_DIR = SCRIPT_DIR.parent
SVG_SRC  = ELECTRON_DIR / "assets" / "icon.svg"
ICONSET  = ELECTRON_DIR / "assets" / "icon.iconset"
ICNS_OUT = ELECTRON_DIR / "assets" / "icon.icns"

SIZES = [16, 32, 64, 128, 256, 512, 1024]

def svg_to_png(svg_path: Path, png_path: Path, size: int):
    """Rasterise SVG → PNG via cairosvg if available, else qlmanage."""
    try:
        import cairosvg  # type: ignore
        cairosvg.svg2png(url=str(svg_path), write_to=str(png_path),
                         output_width=size, output_height=size)
        return
    except ImportError:
        pass

    # Fallback: use macOS qlmanage (generates a Quick Look thumbnail)
    tmp = png_path.parent / "_ql_tmp"
    tmp.mkdir(exist_ok=True)
    subprocess.check_call(
        ["qlmanage", "-t", "-s", str(size), "-o", str(tmp), str(svg_path)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    generated = list(tmp.glob("*.png"))
    if not generated:
        raise RuntimeError("qlmanage produced no PNG output")
    shutil.move(str(generated[0]), str(png_path))
    shutil.rmtree(tmp, ignore_errors=True)


def main():
    if not SVG_SRC.exists():
        sys.exit(f"SVG source not found: {SVG_SRC}")

    ICONSET.mkdir(parents=True, exist_ok=True)

    # Generate the master 1024×1024 PNG first
    master_png = ICONSET / "icon_512x512@2x.png"
    print(f"  Rasterising {SVG_SRC.name} → 1024×1024 …")
    svg_to_png(SVG_SRC, master_png, 1024)

    master = Image.open(master_png).convert("RGBA")

    # iconutil naming convention
    entries = [
        ("icon_16x16.png",       16),
        ("icon_16x16@2x.png",    32),
        ("icon_32x32.png",       32),
        ("icon_32x32@2x.png",    64),
        ("icon_128x128.png",     128),
        ("icon_128x128@2x.png",  256),
        ("icon_256x256.png",     256),
        ("icon_256x256@2x.png",  512),
        ("icon_512x512.png",     512),
        # icon_512x512@2x.png already generated above
    ]

    for name, size in entries:
        out = ICONSET / name
        print(f"  Resizing → {name} ({size}px)")
        resized = master.resize((size, size), Image.LANCZOS)
        resized.save(out, "PNG")

    print(f"  Running iconutil → {ICNS_OUT.name}")
    subprocess.check_call(["iconutil", "-c", "icns", str(ICONSET), "-o", str(ICNS_OUT)])

    shutil.rmtree(ICONSET)
    print(f"\n✓ Generated {ICNS_OUT}")


if __name__ == "__main__":
    main()
