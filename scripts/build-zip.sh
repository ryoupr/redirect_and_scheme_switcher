#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

VERSION=$(grep '"version"' manifest.json | head -n1 | sed -E 's/.*"version" *: *"([0-9.]+)".*/\1/')
OUT=dist
NAME=redirect-scheme-switcher-$VERSION

rm -rf "$OUT"
mkdir -p "$OUT"

STAGE=$(mktemp -d)
cp manifest.json "$STAGE"/
cp -r src "$STAGE"/src
cp -r options "$STAGE"/options
cp -r icons "$STAGE"/icons
cp -r _locales "$STAGE"/_locales
cp README.md "$STAGE"/ || true
cp PRIVACY.md "$STAGE"/ || true
cp LICENSE "$STAGE"/ || true

OUT_ABS="$ROOT_DIR/$OUT"
( cd "$STAGE" && zip -rq "$OUT_ABS/$NAME.zip" . )

echo "Built $OUT/$NAME.zip"
echo "Upload this ZIP in the Chrome Web Store Developer Dashboard."
