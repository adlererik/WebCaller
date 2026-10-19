import test from 'node:test';
import assert from 'node:assert/strict';
import {dialingUI} from '../public/dialing.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,{coarse=false,before=async()=>true,connect=async()=>({id:'synthetic-parent'})}={}){
 const descriptors=['document','window'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]),els=new Map(),calls=[],actions=[],toasts=[];
 function el(id){if(els.has(id))return els.get(id);const hidden=new Set(),events=new Map(),value={value:'',textContent:'',open:false,disabled:false,dataset:{},focuses:0,
 classList:{add:k=>hidden.add(k),remove:k=>hidden.delete(k),toggle:(k,on)=>{on?hidden.add(k):hidden.delete(k);},contains:k=>hidden.has(k)},
 addEventListener:(k,fn)=>events.set(k,fn),showModal(){this.open=true;},close(){this.open=false;},focus(){this.focuses++;},events,
 querySelectorAll:()=>[],replaceChildren(){},append(){},select(){}};els.set(id,value);return value;}
 const digits=['0','1','2','3','4','5','6','7','8','9','back'].map(d=>{const button=el('key-'+d);button.dataset.digit=d;return button;});el('dial-pad').querySelectorAll=()=>digits;
 const buttons=['voice','video','message'].map(x=>el('action-'+x));el('dial-actions').querySelectorAll=()=>buttons;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:el,createElement:tag=>el('created-'+tag)}});Object.defineProperty(globalThis,'window',{configurable:true,value:{matchMedia:()=>({matches:coarse})}});
 t.after(()=>{for(const[k,d]of descriptors)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];});
 const ui=dialingUI({api:async()=>({code:null,blocked:[]}),device:()=>null,config:()=>({publicURL:'https://example.com/calls'}),before,toast:text=>toasts.push(text),connect:async(...args)=>{calls.push(args);return connect(...args);},action:async(...args)=>actions.push(args)});
 const submit=(mode='voice')=>el('dial-form').events.get('submit')({preventDefault(){},submitter:{value:mode}});
 return {ui,el,calls,actions,toasts,submit};
}
test('phone keypad does not summon the software keyboard and builds a memorable code',t=>{
 const f=fixture(t,{coarse:true});f.ui.show();assert.equal(f.el('dial-code').focuses,0);
 for(const d of ['2','0','1','3'])f.el('key-'+d).events.get('click')();assert.equal(f.el('dial-code').value,'2013');assert.equal(f.el('dial-code').focuses,0);
 f.el('key-back').events.get('click')();assert.equal(f.el('dial-code').value,'201');
});
test('malformed codes and iPhone setup guidance cannot create identities or place calls',async t=>{
 const f=fixture(t,{before:async()=>false});f.ui.show('2013');f.el('dial-code').value='123';f.submit();await flush();assert.equal(f.calls.length,0);
 f.el('dial-code').value='2013';f.submit();await flush();assert.equal(f.calls.length,0);assert.equal(f.actions.length,0);assert.equal(f.el('dial-dialog').open,true);assert.equal(f.el('action-voice').disabled,false);
});
test('rapid repeated taps and asynchronous preflight create exactly one connection and selected action',async t=>{
 let release;const f=fixture(t,{before:()=>new Promise(resolve=>release=resolve)});f.ui.show('2013');f.el('dial-name').value='Child';f.submit('video');f.submit('voice');release(true);await flush();await flush();
 assert.deepEqual(f.calls,[['2013','Child']]);assert.deepEqual(f.actions,[[{id:'synthetic-parent'},'video']]);assert.equal(f.el('dial-dialog').open,false);
});
test('failed enrollment leaves the dial pad usable and does not initiate any call',async t=>{
 const f=fixture(t,{connect:async()=>{throw new Error('Temporary connection failure');}});f.ui.show('2013');f.submit();await flush();assert.equal(f.el('dial-dialog').open,true);assert.match(f.el('dial-error').textContent,/Temporary connection/);assert.equal(f.actions.length,0);assert.equal(f.el('action-voice').disabled,false);
});
test('submitting a calling code without choosing a mode defaults to video',async t=>{
 const f=fixture(t);f.ui.show('5426');f.el('dial-form').events.get('submit')({preventDefault(){}});await flush();await flush();
 assert.deepEqual(f.actions,[[{id:'synthetic-parent'},'video']]);
});
