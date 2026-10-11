import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {IDBFactory} from 'fake-indexeddb';import {callIntents} from '../public/call-intents.js';
test('notification answer intents are identity-scoped, short lived and consumed atomically once',async()=>{
 let now=1000;const intents=callIntents({factory:new IDBFactory(),now:()=>now}),owner=randomUUID(),id=randomUUID();
 assert.equal(await intents.take(owner),null);assert.equal(await intents.put(owner,id,90000),true);
 const results=await Promise.all([intents.take(owner),intents.take(owner)]);assert.equal(results.filter(Boolean).length,1);assert.equal(results.find(Boolean).expiresAt,31000);assert.equal(results.find(Boolean).callId,id);
 await intents.put(owner,id,5000);now=5000;assert.equal(await intents.take(owner),null);
 now=1000;await intents.put(owner,id,5000);assert.equal(await intents.take(randomUUID()),null);assert.equal(await intents.take(owner),null);
 for(const args of [['bad',id,5000],[owner,'bad',5000],[owner,id,1.5],[owner,id,999]])assert.equal(await intents.put(...args),false);
 await intents.put(owner,id,5000);await intents.clear();assert.equal(await intents.take(owner),null);
});
test('unavailable storage never invents a notification decision',async()=>{const intents=callIntents({factory:null}),owner=randomUUID();assert.equal(await intents.put(owner,randomUUID(),Date.now()+9999),false);assert.equal(await intents.take(owner),null);await intents.clear();});
