#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build.sh — One-command build for SweetEnglish.dmg (Apple Silicon)
# Run from the repo root:  bash electron/scripts/build.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ELECTRON_DIR="$REPO_ROOT/electron"

echo "▶ SweetEnglish — macOS build"
echo "  Repo root : $REPO_ROOT"
echo "  Electron  : $ELECTRON_DIR"
echo ""

# ── 1. Generate .icns if missing ────────────────────────────────────────────
ICNS="$ELECTRON_DIR/assets/icon.icns"
if [ ! -f "$ICNS" ]; then
  echo "▶ Generating icon.icns …"
  python3 "$ELECTRON_DIR/scripts/generate-icons.py"
else
  echo "✓ icon.icns already exists — skipping generation"
fi

# ── 2. Install Node deps ─────────────────────────────────────────────────────
echo ""
echo "▶ Installing Node dependencies (pnpm) …"
cd "$ELECTRON_DIR"
pnpm install

# ── 3. Run electron-builder ──────────────────────────────────────────────────
echo ""
echo "▶ Building .dmg …"
pnpm run build

echo ""
echo "✓ Done! Installer is in: $ELECTRON_DIR/dist/"
ls -lh "$ELECTRON_DIR/dist/"*.dmg 2>/dev/null || true
