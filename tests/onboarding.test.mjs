import test from 'node:test';
import assert from 'node:assert/strict';
import {readEntryFragment,clearEntryFragment} from '../public/onboarding.js';
test('setup transfer stays in the fragment, clears it before requests, and cannot override an invitation',()=>{
  const code='isolated-private-setup-code';
  const entry=readEntryFragment('#setup='+code+'&name=My phone');
  assert.deepEqual(entry,{invitation:null,setupCode:code,name:'My phone'});
  const addresses=[];
  clearEntryFragment({hash:'#setup='+code,pathname:'/calls/',search:''},{replaceState:(_,__,url)=>addresses.push(url)});
  assert.deepEqual(addresses,['/calls/']);assert.ok(!addresses[0].includes(code));
  assert.equal(readEntryFragment('#invite=invitation.fingerprint&setup='+code).setupCode,null);
  assert.equal(readEntryFragment('#setup=invalid!').setupCode,null);
  clearEntryFragment({hash:'#setup=invalid!',pathname:'/calls/',search:''},{replaceState:(_,__,url)=>addresses.push(url)});
  assert.equal(addresses.length,2);
});
