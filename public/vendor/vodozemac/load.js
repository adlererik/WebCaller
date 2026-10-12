// Apache-2.0 bindings; see LICENSE-APACHE.txt and provenance.json.
import * as bindings from './pkg/vodozemac_bg.js';
let loading;
export async function loadOlm(){
  loading ||= (async()=>{
    const url=new URL('./pkg/vodozemac_bg.wasm',import.meta.url);
    const bytes=globalThis.process?.versions?.node
      ?await (await import('node:fs/promises')).readFile(url)
      :await (await fetch(url,{cache:'no-store'})).arrayBuffer();
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!=='5b3a606864bbcfe31f4e91f12e73b659c494f6d13c36cb6e1ec94dce992410fd')throw new Error('Secure messaging module integrity check failed. Reload the page or contact the server owner.');
    const {instance}=await WebAssembly.instantiate(bytes,{'./vodozemac_bg.js':bindings});
    bindings.__wbg_set_wasm(instance.exports);instance.exports.__wbindgen_start();return bindings;
  })();
  return loading;
}
