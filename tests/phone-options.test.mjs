import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import {vault} from '../public/crypto.js';
import {contactName,renameContact} from '../public/contact-names.js';
import {themeChoice,themeControls} from '../public/theme.js';

test('contact labels are local and cannot replace keys, trust pins or the original name',()=>{
  const peer={id:randomUUID(),name:'Original name',keys:{synthetic:'public keys'}},device={user:{id:randomUUID()},contacts:[peer],pins:{[peer.id]:{...peer}}};
  const before=structuredClone(device);
  assert.equal(renameContact(device,peer,'  Grandma  Jane  '),'Grandma Jane');
  assert.deepEqual(device.contacts,before.contacts);assert.deepEqual(device.pins,before.pins);assert.deepEqual(device.user,before.user);
  assert.equal(contactName(device,peer),'Grandma Jane');assert.equal(contactName({contacts:[peer]},peer),'Original name');
  assert.equal(renameContact(device,peer,peer.name),'Original name');assert.equal(device.contactNames[peer.id],undefined);
});

test('contact labels survive a vault reload and a fresh server roster',async t=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()});
  t.after(()=>prior?Object.defineProperty(globalThis,'indexedDB',prior):delete globalThis.indexedDB);
  const peer={id:randomUUID(),name:'Original name',keys:{synthetic:true}},device={user:{id:randomUUID()},token:'synthetic unchanged token',contacts:[peer],pins:{[peer.id]:peer}};
  renameContact(device,peer,'Dad');await vault('put',device);const loaded=await vault('get');loaded.contacts=[structuredClone(peer)];
  assert.equal(contactName(loaded,loaded.contacts[0]),'Dad');assert.equal(loaded.token,device.token);assert.deepEqual(loaded.pins,device.pins);
});

test('invalid or removed contacts cannot add arbitrary identity properties',()=>{
  const peer={id:randomUUID(),name:'Friend'},device={contacts:[peer]};
  for(const value of ['x'.repeat(49),'A\u202eB',null])assert.throws(()=>renameContact(device,peer,value));
  assert.throws(()=>renameContact(device,{id:'__proto__',name:'Bad'},'Other'));
  assert.throws(()=>renameContact(device,{id:randomUUID(),name:'Gone'},'Other'));
  assert.equal(device.contactNames,undefined);
});

function themeFixture(value='system',dark=false){
  const handlers={},select={value:'',addEventListener:(event,fn)=>handlers.select=fn},meta=[{content:''},{content:''}],saved=new Map([['webcaller-theme',value]]);
  const document={documentElement:{dataset:{},style:{}},getElementById:()=>select,querySelectorAll:()=>meta};
  const storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},media={matches:dark,addEventListener:(event,fn)=>handlers.media=fn};
  themeControls({document,storage,media});
  return {document,media,meta,saved,choose(value){select.value=value;handlers.select();},system(dark){media.matches=dark;handlers.media();}};
}
test('automatic appearance follows the phone while explicit dark and light choices persist',()=>{
  const f=themeFixture();assert.equal(f.document.documentElement.dataset.theme,'light');
  f.system(true);assert.equal(f.document.documentElement.dataset.theme,'dark');
  f.choose('light');assert.equal(f.document.documentElement.dataset.theme,'light');f.system(true);assert.equal(f.document.documentElement.style.colorScheme,'light');
  f.choose('dark');f.system(false);assert.equal(f.document.documentElement.dataset.theme,'dark');assert.equal(f.saved.get('webcaller-theme'),'dark');assert.equal(f.meta[0].content,'#191b20');
  assert.equal(themeFixture(f.saved.get('webcaller-theme')).document.documentElement.dataset.theme,'dark');
  f.choose('system');assert.equal(f.document.documentElement.dataset.theme,'light');
});
test('appearance tolerates unavailable storage and invalid saved preferences',()=>{
  assert.equal(themeChoice('unexpected'),'system');const document={documentElement:{dataset:{},style:{}},getElementById:()=>null,querySelectorAll:()=>[]};
  assert.doesNotThrow(()=>themeControls({document,storage:{getItem(){throw Error('Unavailable');}},media:{matches:true}}));assert.equal(document.documentElement.dataset.theme,'dark');
});
