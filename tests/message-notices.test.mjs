import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {IDBFactory} from 'fake-indexeddb';
import {messageIntents,resolveMessageIntent} from '../public/message-intents.js';import {remainingTime,updateCountdowns} from '../public/message-expiry.js';import {acceptTransfer,purgeTransfers} from '../public/transfer-state.js';
test('message-notification navigation is one-use, identity bound, expires, validates sender and keeps IDs out of links',async()=>{
 let now=1000;const store=messageIntents({factory:new IDBFactory(),now:()=>now}),owner=randomUUID(),peerId=randomUUID(),id=randomUUID(),contacts=[{id:peerId,name:'Test contact'}];
 assert.equal(await store.put(owner,id,peerId,500000),true);const [a,b]=await Promise.all([store.take(owner),store.take(owner)]);const intent=a||b;assert.equal(Number(!!a)+Number(!!b),1);assert.equal(intent.expiresAt,121000);
 const m={id,from:peerId,to:owner,expiresAt:8000},messages=new Map([[id,m]]);assert.equal(resolveMessageIntent(intent,messages,contacts,owner,now).message,m);
 assert.equal(resolveMessageIntent(intent,new Map([[id,{...m,from:randomUUID()}]]),contacts,owner,now),null);assert.equal(resolveMessageIntent(intent,messages,[],owner,now),null);assert.equal(resolveMessageIntent(intent,messages,contacts,randomUUID(),now),null);
 assert.equal(resolveMessageIntent(intent,new Map(),contacts,owner,now).message,null);assert.equal(resolveMessageIntent(intent,messages,contacts,owner,9000).message,null);
 now=121000;assert.equal(resolveMessageIntent(intent,messages,contacts,owner,now),null);await store.put(owner,id,peerId,now+1000);now+=1000;assert.equal(await store.take(owner),null);
 assert.equal(await store.put(owner,id,'bad',now+9999),false);await store.put(owner,id,peerId,now+9999);await store.clear();assert.equal(await store.take(owner),null);
});
test('countdowns respect the original deadline and update only expiry spans',()=>{
 for(const [ms,want]of [[-10,'0s'],[1,'1s'],[30000,'30s'],[61000,'1m 1s'],[3661000,'1h 1m'],[90000000,'1d 1h']])assert.equal(remainingTime(1000+ms,1000),want);
 assert.equal(remainingTime(NaN),'');const value={textContent:''},attrs={},node={dataset:{expires:'32000'},querySelector:s=>{assert.equal(s,'.expiry-value');return value;},setAttribute:(k,v)=>attrs[k]=v};
 const container={querySelectorAll:s=>{assert.equal(s,'.message-expiry');return [node];}};updateCountdowns(container,1000);assert.equal(value.textContent,'31s');updateCountdowns(container,2000);assert.equal(value.textContent,'30s');assert.equal(attrs['aria-label'],'Disappears in 30s');
});
function progress(){const self=randomUUID(),peer=randomUUID(),id=randomUUID(),target=randomUUID();return {self,peer,pending:new Map(),envelope:{id,from:peer,to:self,createdAt:2000,expiresAt:22000},payload:{kind:'transfer',target,createdAt:1000,expiresAt:61000,percent:10,attachment:{id:randomUUID(),name:'Example.jpg',type:'image/jpeg',size:12345}}};}
test('ephemeral transfer placeholders reject wrong/late versions and cannot resurrect committed or deleted media',()=>{
 const f=progress(),options={self:f.self,now:3000};assert.equal(acceptTransfer(f.pending,f.envelope,f.payload,options),true);assert.equal(f.pending.get(f.payload.target).percent,10);
 const next={...f.envelope,id:randomUUID(),createdAt:4000,expiresAt:24000};assert.equal(acceptTransfer(f.pending,next,{...f.payload,percent:60},options),true);assert.equal(f.pending.get(f.payload.target).percent,60);
 assert.equal(acceptTransfer(f.pending,f.envelope,f.payload,options),false);assert.equal(acceptTransfer(f.pending,{...next,id:randomUUID(),createdAt:5000},{...f.payload,percent:40},options),true);assert.equal(f.pending.get(f.payload.target).percent,60);
 for(const patch of [{percent:101},{percent:-1},{target:'bad'},{attachment:{...f.payload.attachment,name:'Changed'}},{expiresAt:61000.5}])assert.equal(acceptTransfer(f.pending,{...next,id:randomUUID(),createdAt:6000},{...f.payload,...patch},options),false);
 assert.equal(acceptTransfer(f.pending,{...next,from:randomUUID()},f.payload,options),false);
 for(const blocked of ['known','deleted']){const fresh=progress();assert.equal(acceptTransfer(fresh.pending,fresh.envelope,fresh.payload,{self:fresh.self,now:3000,[blocked]:new Map([[fresh.payload.target,{}]])}),false);}
 assert.equal(purgeTransfers(f.pending,24000),true);assert.equal(f.pending.size,0);assert.equal(purgeTransfers(f.pending,25000),false);
});
