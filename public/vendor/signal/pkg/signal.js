import * as wasm from "./signal_bg.wasm";
export * from "./signal_bg.js";
import { __wbg_set_wasm } from "./signal_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
