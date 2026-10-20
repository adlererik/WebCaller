"""Check the pinned public core and checked browser binding artifacts."""
from pathlib import Path
import hashlib,json,subprocess
root=Path(__file__).resolve().parents[1]
upstream=root/'third_party/libsignal/upstream'
pin='1738ead8a12ffe539f6309958123dadb16dc3b95'
def git(*args):return subprocess.check_output(['git',*args],cwd=root,text=True).strip()
if not (upstream/'Cargo.toml').is_file():raise SystemExit('Initialize the pinned source: git submodule update --init --recursive')
if (root/'.git').exists():
 assert git('-C',str(upstream),'rev-parse','HEAD')==pin,'Wrong libsignal source commit'
 assert not git('-C',str(upstream),'status','--porcelain'),'Upstream source must be pristine'
 assert git('config','-f','.gitmodules','--get','submodule.third_party/libsignal/upstream.url')=='https://github.com/signalapp/libsignal.git'
vendor=root/'public/vendor/signal';meta=json.loads((vendor/'provenance.json').read_text())
assert meta['commit']==pin and meta['packageVersion']=='0.105.1' and meta['officialProtocolSourceModified'] is False
for name,field in [('public/vendor/signal/pkg/signal_bg.wasm','wasmSha256'),('third_party/libsignal/binding/src/lib.rs','bindingSourceSha256'),('third_party/libsignal/binding/Cargo.lock','bindingLockSha256')]:
 assert hashlib.sha256((root/name).read_bytes()).hexdigest()==meta[field],name+' hash mismatch'
assert (root/'LICENSE').read_bytes()==(upstream/'LICENSE').read_bytes(),'Retain the full upstream AGPL license'
print('PASS pinned official libsignal source, binding/lock/WASM hashes and license')
