import os,pathlib,subprocess,hashlib,json,re
root=pathlib.Path(__file__).resolve().parent
cargo=pathlib.Path(os.environ.get('CARGO_HOME',str(pathlib.Path.home()/'.cargo')))
rustup=pathlib.Path(os.environ.get('RUSTUP_HOME',str(pathlib.Path.home()/'.rustup')))
env=dict(os.environ)
env['CARGO_ENCODED_RUSTFLAGS']='\x1f'.join(['--cfg=getrandom_backend="wasm_js"',f'--remap-path-prefix={root}=/src/webcaller-preview',f'--remap-path-prefix={cargo}=/rust/cargo',f'--remap-path-prefix={rustup}=/rust/toolchain'])
subprocess.run(['cargo','+1.98.1','build','--locked','--release','--target','wasm32-unknown-unknown','--manifest-path',str(root/'binding/Cargo.toml')],env=env,check=True)
out=root.parents[1]/'public/vendor/signal';subprocess.run(['wasm-bindgen','--remove-producers-section','--target','bundler','--out-name','signal','--out-dir',str(out/'pkg'),str(root/'binding/target/wasm32-unknown-unknown/release/webcaller_signal.wasm')],env=env,check=True)
w=out/'pkg/signal_bg.wasm';digest=hashlib.sha256(w.read_bytes()).hexdigest();p=out/'load.js';p.write_text(re.sub(r"hash!=='[a-f0-9]{64}'",f"hash!=='{digest}'",p.read_text()))
p=out/'provenance.json';v=json.loads(p.read_text());v.update({'wasmSha256':digest,'wasmBytes':w.stat().st_size,'bindingSourceSha256':hashlib.sha256((root/'binding/src/lib.rs').read_bytes()).hexdigest(),'bindingLockSha256':hashlib.sha256((root/'binding/Cargo.lock').read_bytes()).hexdigest()});p.write_text(json.dumps(v,indent=2)+'\n');print('Built pinned experimental Signal module:',digest)
