#!/usr/bin/env bash
# ============================================================
#  Tinko — one-line installer for Linux VPS (Ubuntu/Debian/Rocky/Alma)
#  Usage:
#    bash install.sh            # full install + start
#    bash install.sh --cli-only # only install the tinko CLI
# ============================================================
set -euo pipefail
MODE="${1:-}"
REPO_URL="${REPO_URL:-https://github.com/mahsa0575-dotcom/Tinko.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/tinko}"

if [ "$(id -u)" -ne 0 ]; then echo "✖ با sudo اجرا کنید"; exit 1; fi

echo "── نصب پیش‌نیازها (git, curl) ──"
if ! command -v git >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -y git curl
  elif command -v dnf >/dev/null 2>&1; then dnf install -y git curl
  elif command -v yum >/dev/null 2>&1; then yum install -y git curl
  fi
fi

if [ "$MODE" != "--cli-only" ]; then
  echo "── دریافت کد Tinko ──"
  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" pull --ff-only || true
  else
    rm -rf "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  cd "$INSTALL_DIR"
  chmod +x tinko
fi

ln -sf "$INSTALL_DIR/tinko" /usr/local/bin/tinko
echo "✔ فرمان tinko نصب شد"
echo

if [ "$MODE" = "--cli-only" ]; then
  echo "استفاده: tinko help"
  exit 0
fi

echo "── شروع نصب کامل (Docker + .env + build + اجرا) ──"
exec bash "$INSTALL_DIR/tinko" setup
