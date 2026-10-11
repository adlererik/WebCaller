import test from 'node:test';import assert from 'node:assert/strict';
import {applyMessageEvent,validReaction,validMessageId} from '../public/message-state.js';
const make=()=>({id:'a0000000-0000-0000-0000-000000000000',from:'a',to:'b',createdAt:1000,expiresAt:10000,text:'hello'});
function change(m,kind,data={},actor='a',createdAt=2000){const envelope={id:String(createdAt),from:actor,to:actor==='a'?'b':'a',createdAt,expiresAt:9900};return applyMessageEvent(m,{kind,envelope},{kind:'message-'+kind,target:m.id,...data},3000);}
test('message state binds decrypted updates to target, roles and original lifetime',()=>{
 const m=make();assert.equal(change(m,'edit',{text:'bad'},'b'),false);assert.equal(m.text,'hello');assert.equal(change(m,'edit',{text:'updated'}),true);assert.equal(m.text,'updated');
 assert.equal(change(m,'edit',{text:'older'},'a',1500),false);assert.equal(m.text,'updated');
 assert.equal(change(m,'reaction',{emoji:'👍',target:'another'},'b'),false);assert.equal(change({...m,expiresAt:2900},'pin',{pinned:true}),false);
 assert.equal(change({...m,location:{lat:0,lon:0}},'edit',{text:'fake location'}),false);
});
test('reactions toggle independently, pins resolve cross-participant ordering, seen survives later delivery',()=>{
 const m=make();assert.equal(change(m,'reaction',{emoji:'❤️'}),true);assert.equal(change(m,'reaction',{emoji:'👍'},'b'),true);assert.deepEqual(m.reactions,{a:'❤️',b:'👍'});
 assert.equal(change(m,'reaction',{emoji:''},'a',2100),true);assert.deepEqual(m.reactions,{b:'👍'});
 assert.equal(change(m,'pin',{pinned:true},'a',2400),true);assert.equal(change(m,'pin',{pinned:false},'b',2200),true);assert.equal(m.pinned,true);
 assert.equal(change(m,'read',{deliveredAt:1500,readAt:1900},'b',2000),true);assert.equal(change(m,'receipt',{deliveredAt:1700},'b',2500),true);assert.deepEqual(m.receipt,{deliveredAt:1500,readAt:1900});
 assert.equal(change(m,'read',{deliveredAt:1800,readAt:1600},'b',2600),false);assert.equal(change(m,'receipt',{deliveredAt:1900},'a',2600),false);
});
test('emoji validation accepts single Unicode emoji including tones, family, flags and keycaps',()=>{
 for(const emoji of ['❤️','👍🏽','👨‍👩‍👧‍👦','🇸🇪','1️⃣',''])assert.ok(validReaction(emoji),emoji);
 for(const value of ['two','👍👍','<script>',null,'👍'.repeat(50)])assert.equal(validReaction(value),false);
 assert.ok(validMessageId(make().id));assert.equal(validMessageId('bad'),false);
});
