// Experimental binding around pinned official libsignal; see provenance.json.
import * as bindings from './pkg/signal_bg.js';
let loading;
export async function loadSignalBinding(){return loading ||= (async()=>{
 const url=new URL('./pkg/signal_bg.wasm',import.meta.url);
 const bytes=globalThis.process?.versions?.node?await(await import('node:fs/promises')).readFile(url):await(await fetch(url,{cache:'no-store'})).arrayBuffer();
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!=='b00f26c02a1ddebd3eb903da1360f11b97257ad7691f11b2fa7832745dc16fdf')throw Error('Test encryption module integrity check failed.');
 const {instance}=await WebAssembly.instantiate(bytes,{'./signal_bg.js':bindings});bindings.__wbg_set_wasm(instance.exports);instance.exports.__wbindgen_start();return bindings;
})();}
