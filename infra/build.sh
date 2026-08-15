#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAMBDA_DIR="$SCRIPT_DIR/lambda"
BUILD_DIR="$SCRIPT_DIR/builds"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

LAMBDAS=(scraper-processor subscription-processor email-sender ai-processor)
NEEDS_SHARED=(scraper-processor subscription-processor ai-processor)

needs_shared() {
  local name="$1"
  for n in "${NEEDS_SHARED[@]}"; do
    [[ "$n" == "$name" ]] && return 0
  done
  return 1
}

for name in "${LAMBDAS[@]}"; do
  echo "Building $name..."
  staging="$BUILD_DIR/_stage_$name"
  rm -rf "$staging"
  cp -r "$LAMBDA_DIR/$name" "$staging"

  if needs_shared "$name"; then
    mkdir -p "$staging/shared"
    cp "$LAMBDA_DIR/shared/"* "$staging/shared/"
  fi

  (
    cd "$staging"
    npm install --omit=dev --no-audit --no-fund --silent
  )

  (
    cd "$staging"
    if command -v zip >/dev/null 2>&1; then
      zip -rq "$BUILD_DIR/$name.zip" .
    else
      win_dest=$(cygpath -w "$BUILD_DIR/$name.zip" 2>/dev/null || echo "$BUILD_DIR/$name.zip")
      powershell -NoProfile -Command "Compress-Archive -Path * -DestinationPath '$win_dest' -Force"
    fi
  )

  rm -rf "$staging"
  echo "  -> $BUILD_DIR/$name.zip"
done

echo "All lambda packages built in $BUILD_DIR"
