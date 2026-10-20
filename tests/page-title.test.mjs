import test from 'node:test';
import assert from 'node:assert/strict';
import {pageTitle,pageTitleControls} from '../public/page-title.js';
function fixture(storage){
  const handlers={},elements={};
  for(const id of ['page-title-open','page-title-dialog','page-title-form','page-title-input','page-title-value'])elements[id]={addEventListener:(name,fn)=>handlers[id+':'+name]=fn};
  const input=elements['page-title-input'];input.setCustomValidity=value=>input.error=value;input.reportValidity=()=>{};input.focus=()=>{};
  const dialog=elements['page-title-dialog'];dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;
  const document={title:'',getElementById:id=>elements[id]};pageTitleControls({document,storage});
  return {document,input,dialog,elements,open:()=>handlers['page-title-open:click'](),save(value){input.value=value;handlers['page-title-form:submit']({preventDefault(){}});}};
}
test('a neutral title is applied before account startup and a local preference survives reload',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const f=fixture(storage);assert.equal(f.document.title,'Home');f.open();assert.equal(f.input.value,'Home');f.save('  Garden  notes ');
  assert.equal(f.document.title,'Garden notes');assert.equal(f.dialog.open,false);assert.equal(fixture(storage).document.title,'Garden notes');
  f.save('');assert.equal(f.document.title,'Home');
});
test('the title is plain text; invalid input cannot overwrite the saved title',()=>{
  const f=fixture();f.open();f.save('<b>Notes</b>');assert.equal(f.document.title,'<b>Notes</b>');
  for(const value of ['A\u202eB','a'.repeat(49),'a\nb']){f.open();f.save(value);assert.ok(f.input.error);assert.equal(f.dialog.open,true);assert.equal(f.document.title,'<b>Notes</b>');}
  assert.equal(pageTitle(null),null);assert.equal(fixture({getItem(){throw Error('Unavailable');}}).document.title,'Home');
});
