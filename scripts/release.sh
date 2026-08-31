#!/usr/bin/env bash
# Build Tinko release bundles (source-based deployable archives per OS/target).
# Usage: bash scripts/release.sh [version]
set -euo pipefail
VERSION="${1:-0.4.0}"
OUT="release"
rm -rf "$OUT" && mkdir -p "$OUT"

STAMP="$(date +%Y-%m-%d)"
build_bundle() {
  local name="$1" wrapper="$2"
  local dir="$OUT/Tinko-$VERSION-$name"
  mkdir -p "$dir"
  # core sources
  cp -r packages apps migrations scripts "$dir/"
  cp package.json vitest.config.js tinko install.sh README.md CHANGELOG.md "$dir/"
  cp .env.example "$dir/"
  [ -f docker-compose.yml ] && cp docker-compose.yml "$dir/"
  [ -f .dockerignore ] && cp .dockerignore "$dir/"
  [ -f .github ] && cp -r .github "$dir/" || true
  mkdir -p "$dir/.github/workflows" && cp .github/workflows/ci.yml "$dir/.github/workflows/" 2>/dev/null || true
  # platform wrapper
  printf '%s\n' "$wrapper" > "$dir/tinko.bat" 2>/dev/null || true
  tar -czf "$OUT/Tinko-$VERSION-$name.tar.gz" -C "$OUT" "Tinko-$VERSION-$name"
  rm -rf "$dir"
  echo "✔ $OUT/Tinko-$VERSION-$name.tar.gz"
}

LINUX_WRAPPER='#!/usr/bin/env bash
cd "$(dirname "$0")"
exec bash ./tinko "$@"'

MAC_WRAPPER="$LINUX_WRAPPER"

WIN_WRAPPER='@echo off
cd /d "%~dp0"
where docker >nul 2>nul || (echo Docker Desktop is required & exit /b 1)
bash ./tinko %*'

build_bundle linux-x86_64 "$LINUX_WRAPPER"
build_bundle linux-arm64  "$LINUX_WRAPPER"
build_bundle macos-arm64  "$MAC_WRAPPER"
build_bundle macos-x64    "$MAC_WRAPPER"
build_bundle windows-x64  "$WIN_WRAPPER"
build_bundle source       "$LINUX_WRAPPER"

echo
echo "All bundles in ./$OUT"
