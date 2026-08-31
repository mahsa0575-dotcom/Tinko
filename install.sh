#!/usr/bin/env bash
# ============================================================
#  Tinko — one-line installer for Linux VPS (Ubuntu/Debian/Rocky/Alma)
#  Usage:
#    bash install.sh            # full install + start
#    bash install.sh --cli-only # only install the tinko CLI
# ============================================================
set -euo pipefail
REPO_URL="${REPO_URL:-https://github.com/mahsa0575-dotcom/Tinko.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/tinko}"

if [ "$(id -u)" -ne 0 ]; then echo "✖ با sudo اجرا کنید"; exit 1; fi

echo "── نصب پیش‌نیازها (git, curl) ──"
command -v git >/dev/null || (apt-get update -qq && apt-get install -y git curl || dnf install -y git curl)

if [ "$1" != "--cli-only" ]; then
  echo "── دریافت کد Tinko ──"
  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" pull --ff-only
  else
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  cd "$INSTALL_DIR"
  chmod +x tinko
fi

ln -sf "$INSTALL_DIR/tinko" /usr/local/bin/tinko
echo "✔ tinko CLI نصب شد — اجرا کنید: tinko setup"
[ "$1" != "--cli-only" ] && cd "$INSTALL_DIR" && exec tinko setup
