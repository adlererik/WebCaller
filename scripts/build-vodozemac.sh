#!/usr/bin/env bash
set -euo pipefail
task_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$task_root"
task_source="$task_root/third_party/vodozemac-bindings"
task_build="$task_root/.runtime/vodozemac-build"
test "$(rustc --version | cut -d ' ' -f 2)" = 1.90.0 || { echo 'Use the pinned Rust 1.90.0 toolchain.' >&2; exit 1; }
test "$(wasm-bindgen --version)" = 'wasm-bindgen 0.2.100' || { echo 'Use wasm-bindgen-cli 0.2.100.' >&2; exit 1; }
# Encoded flags preserve spaces in checkout paths. Registry path remapping also
# makes the artifact independent of the operator's cargo cache location.
task_registry="${CARGO_HOME:-$HOME/.cargo}/registry"
printf -v task_flags '%s\x1f' '--cfg=getrandom_backend="wasm_js"' "--remap-path-prefix=$task_root=." "--remap-path-prefix=$task_registry=registry"
export CARGO_ENCODED_RUSTFLAGS="${task_flags%$'\x1f'}"
unset RUSTFLAGS
cargo build --locked --release --target wasm32-unknown-unknown --manifest-path "$task_source/Cargo.toml" --target-dir "$task_build/target"
wasm-bindgen --remove-producers-section --target bundler --out-name vodozemac --out-dir "$task_build/pkg" "$task_build/target/wasm32-unknown-unknown/release/vodozemac.wasm"
cargo metadata --locked --format-version 1 --filter-platform wasm32-unknown-unknown --manifest-path "$task_source/Cargo.toml" > "$task_build/metadata.json"
python3 scripts/vendor-vodozemac.py "$task_build"
