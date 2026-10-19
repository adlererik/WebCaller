#!/usr/bin/env python3
"""Record exact build inputs, license notices and hashes for the local WASM build."""
import hashlib
import json
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parent.parent
build = Path(sys.argv[1])
source = root / 'third_party/vodozemac-bindings'
vendor = root / 'public/vendor/vodozemac'
metadata = json.loads((build / 'metadata.json').read_text())
packages = sorted(metadata['packages'], key=lambda p: (p['name'], p['version']))
core = next(p for p in packages if p['name'] == 'vodozemac')
assert core['version'] == '0.11.1'
notices = ['License notices for registry dependencies in this binding Cargo.lock.\n'
           'Generated from the pinned build metadata; includes build dependencies.\n']
for package in packages:
    if package['source'] is None:
        continue
    directory = Path(package['manifest_path']).parent
    candidates = {p for p in directory.iterdir() if p.is_file() and p.name.upper().startswith(('LICENSE', 'COPYRIGHT', 'NOTICE'))}
    for subdir in directory.iterdir():
        if subdir.is_dir() and subdir.name.upper().startswith(('LICENSE', 'COPYRIGHT', 'NOTICE')):
            candidates.update(p for p in subdir.rglob('*') if p.is_file())
    if package.get('license_file'):
        candidates.add(directory / package['license_file'])
    external = source / 'licenses' / f"{package['name']}-{package['version']}.txt"
    if not candidates and external.exists():
        candidates.add(external)
    if not candidates:
        raise SystemExit('Missing license text for ' + package['name'])
    notices.append(f"\n{package['name']} {package['version']} ({package['license']})\n")
    for path in sorted(candidates):
        relative = path.relative_to(directory) if path.is_relative_to(directory) else path.name
        notices.append(f"\n{package['name']}-{package['version']}/{relative}\n")
        notices.append(path.read_text())
# Normalize trailing whitespace only; retain the license wording in full.
(vendor / 'THIRD-PARTY-NOTICES.txt').write_text('\n'.join(line.rstrip() for line in '\n'.join(notices).splitlines()) + '\n')
for name in ['vodozemac_bg.wasm', 'vodozemac_bg.js', 'vodozemac.d.ts']:
    shutil.copyfile(build / 'pkg' / name, vendor / 'pkg' / name)
shutil.copyfile(source / 'Cargo.lock', vendor / 'UPSTREAM-Cargo.lock')
shutil.copyfile(source / 'LICENSE-APACHE', vendor / 'LICENSE-APACHE.txt')
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
wasm_hash = digest(vendor / 'pkg/vodozemac_bg.wasm')
loader = vendor / 'load.js'
import re
loader.write_text(re.sub(r"digest!=='[a-f0-9]{64}'", "digest!=='" + wasm_hash + "'", loader.read_text()))
inputs = [*source.glob('src/*.rs'), *source.glob('licenses/*'), source / 'LICENSE-APACHE', source / 'Cargo.toml', source / 'Cargo.lock', source / 'rust-toolchain.toml', root / 'scripts/build-vodozemac.sh', root / 'scripts/vendor-vodozemac.py']
manifest = {
    'package': 'webcaller-vodozemac', 'version': '0.2.0', 'core': 'vodozemac 0.11.1',
    'source': 'third_party/vodozemac-bindings',
    'bindingUpstream': 'https://github.com/towns-protocol/vodozemac-bindings',
    'bindingUpstreamRevision': '561147cb65f416f290b70630e25938881ddf1094',
    'coreSource': 'https://github.com/matrix-org/vodozemac/tree/0.11.1',
    'coreRevision': '3e11ae87d157da6bcac3cbf7825d37c8f5ed60af',
    'license': 'Apache-2.0',
    'build': {'rust': '1.90.0', 'wasmBindgen': '0.2.100', 'target': 'wasm32-unknown-unknown',
              'command': 'bash scripts/build-vodozemac.sh', 'optimization': 'Cargo release opt-level=s, LTO; no wasm-opt',
              'inboundSessionConfig': 'Explicit Olm V2; never inferred or defaulted'},
    'files': {name: digest(vendor / name) for name in ['pkg/vodozemac_bg.js', 'pkg/vodozemac_bg.wasm', 'pkg/vodozemac.d.ts', 'LICENSE-APACHE.txt', 'THIRD-PARTY-NOTICES.txt', 'UPSTREAM-Cargo.lock']},
    'sourceFiles': {str(path.relative_to(root)): digest(path) for path in sorted(inputs)},
    'bindingReview': 'WebCaller adaptations and this application integration have not been independently audited.'
}
(vendor / 'provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Vendored Vodozemac 0.11.1: {wasm_hash}; {(vendor / "pkg/vodozemac_bg.wasm").stat().st_size} WASM bytes')
