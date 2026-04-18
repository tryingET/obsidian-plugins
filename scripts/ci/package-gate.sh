#!/bin/sh
set -eu

say() { printf '%s\n' "$*"; }
err() { printf '%s\n' "$*" >&2; }
die() { err "error: $*"; exit 1; }

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not a git repo"
cd "$repo_root"

mode="${1:-}"
[ -n "$mode" ] || die "usage: scripts/ci/package-gate.sh <check|test|ci>"

layer_manager_dir="./packages/obsidian-excalidraw-layer-manager"
[ -f "$layer_manager_dir/package.json" ] || die "missing package manifest: $layer_manager_dir/package.json"

run_package_script() {
  script_name="$1"
  say "[package-gate] $layer_manager_dir :: npm run $script_name"
  npm --prefix "$layer_manager_dir" run "$script_name"
}

case "$mode" in
  check-fast)
    run_package_script "check:fast"
    ;;
  check)
    run_package_script "check"
    ;;
  test)
    run_package_script "test"
    ;;
  ci)
    run_package_script "check"
    ;;
  *)
    die "unknown mode: $mode"
    ;;
esac
