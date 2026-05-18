#!/usr/bin/env bash
set -euo pipefail

artifact_root="${ARTIFACT_ROOT:-release-artifacts}"

if [ -z "${BUTLER_API_KEY:-}" ]; then
  echo "BUTLER_API_KEY is required for itch.io publishing." >&2
  exit 1
fi

if [ -z "${ITCH_TARGET:-}" ]; then
  echo "ITCH_TARGET is required for itch.io publishing." >&2
  exit 1
fi

if [ ! -d "$artifact_root" ]; then
  echo "Artifact root was not found: $artifact_root" >&2
  exit 1
fi

echo "Downloaded artifact files:"
find "$artifact_root" -maxdepth 5 -type f -print | sort

find_artifact() {
  local pattern="$1"
  local label="$2"
  local artifact

  artifact="$(find "$artifact_root" -name "$pattern" -type f -print | sort | head -n 1)"
  if [ -z "$artifact" ] || [ ! -f "$artifact" ]; then
    echo "Expected $label artifact was not found." >&2
    exit 1
  fi

  printf '%s' "$artifact"
}

extract_macos_package_dir() {
  local zip_path="$1"
  local arch="$2"
  local extract_dir="$RUNNER_TEMP/itch-macos-$arch"
  local package_dir

  rm -rf "$extract_dir"
  mkdir -p "$extract_dir"
  unzip -q "$zip_path" -d "$extract_dir"

  package_dir="$(find "$extract_dir" -mindepth 1 -maxdepth 1 -type d -print | sort | head -n 1)"
  if [ -z "$package_dir" ] || [ ! -d "$package_dir/PixelAid.app" ]; then
    echo "Expected PixelAid.app inside macOS $arch package artifact." >&2
    exit 1
  fi

  printf '%s' "$package_dir"
}

web_zip="$(find_artifact '*web-itch.zip' 'itch.io web')"
windows_zip="$(find_artifact '*windows*-signed-portable.zip' 'signed Windows')"
macos_arm64_zip="$(find_artifact '*macos*-arm64-signed-app.zip' 'signed macOS arm64')"

web_name="${web_zip##*/}"
version="${web_name#PixelAid-}"
version="${version%-web-itch.zip}"
if [ -z "$version" ] || [ "$version" = "$web_name" ]; then
  echo "Could not derive PixelAid version from web artifact: $web_name" >&2
  exit 1
fi

macos_arm64_dir="$(extract_macos_package_dir "$macos_arm64_zip" arm64)"

butler push "$web_zip" "$ITCH_TARGET:html5" --userversion "$version"
butler push "$windows_zip" "$ITCH_TARGET:windows" --userversion "$version"
butler push "$macos_arm64_dir" "$ITCH_TARGET:macos-arm64" --userversion "$version"

if [ "${PUBLISH_MACOS_X64:-false}" = "true" ]; then
  macos_x64_zip="$(find_artifact '*macos*-x64-signed-app.zip' 'signed macOS x64')"
  macos_x64_dir="$(extract_macos_package_dir "$macos_x64_zip" x64)"

  butler push "$macos_x64_dir" "$ITCH_TARGET:macos-x64" --userversion "$version"
fi
