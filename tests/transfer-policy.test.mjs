import test from 'node:test';import assert from 'node:assert/strict';
import {transferBudget,transferPacer,TRANSFER_PART_SIZE} from '../public/transfer-policy.js';
const good={state:'connected',profile:'wifi',mode:'wifi',stats:{loss:0,rtt:.1,jitter:.01,bandwidth:2000000,uploadKbps:900}};
test('file transfer reserves voice capacity and stops for poor audio, reconnection and missing statistics',()=>{
 assert.equal(TRANSFER_PART_SIZE,4096);assert.equal(transferBudget(null),Infinity);assert.equal(transferBudget(good),128000);
 assert.equal(transferBudget({...good,mode:'saver'}),32000);
 for(const change of [{profile:'weak'},{profile:'critical'},{state:'disconnected'},{stats:null},{stats:{...good.stats,loss:.04}},{stats:{...good.stats,bandwidth:100000,uploadKbps:120}}])assert.equal(transferBudget({...good,...change}),0);
 assert.equal(transferBudget({...good,stats:{...good.stats,bandwidth:Infinity}}),64000);
});
test('waiting transfers resume when a call ends and cancel promptly without leaking abort handlers',async()=>{
 let call={...good,state:'disconnected'},waiting=false;const controller=new AbortController(),pace=transferPacer(()=>call,v=>waiting=v);
 const pending=pace(4096,controller.signal);assert.equal(waiting,true);call=null;await pending;assert.equal(waiting,false);
 call={...good,profile:'weak'};const next=pace(4096,controller.signal);controller.abort();await assert.rejects(next,{name:'AbortError'});
});
