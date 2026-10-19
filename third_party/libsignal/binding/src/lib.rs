//! Experimental browser/storage adapter. All key agreement, signatures, KEM,
//! message encryption and ratcheting are delegated to unmodified libsignal.
use std::{collections::BTreeMap, future::Future, pin::pin, task::{Context, Poll, Waker}, time::{Duration,SystemTime}};
use async_trait::async_trait;
use base64::{Engine,engine::general_purpose::STANDARD_NO_PAD as B64};
use libsignal_protocol::{*,kem};
use rand::{Rng,TryRngCore};
use serde::{Serialize,Deserialize};
use serde_json::{Value,json};
use zeroize::{Zeroize,Zeroizing};
#[cfg(target_arch="wasm32")] use wasm_bindgen::prelude::*;
type E=Box<dyn std::error::Error>;
type Result<T>=std::result::Result<T,SignalProtocolError>;
fn enc(b:impl AsRef<[u8]>)->String{B64.encode(b)}
fn dec(s:&str)->std::result::Result<Zeroizing<Vec<u8>>,E>{Ok(Zeroizing::new(B64.decode(s)?))}
fn immediate<T>(f:impl Future<Output=Result<T>>)->std::result::Result<T,E>{
 let mut f=pin!(f);match f.as_mut().poll(&mut Context::from_waker(Waker::noop())){
  Poll::Ready(r)=>Ok(r?),Poll::Pending=>Err("Unexpected asynchronous storage operation".into())
 }
}
fn address(s:&str)->std::result::Result<ProtocolAddress,E>{
 if s.is_empty()||s.len()>160{return Err("Invalid protocol address".into())}
 Ok(ProtocolAddress::new(s.to_owned(),DeviceId::new(1)?))
}
#[derive(Clone,Serialize,Deserialize)]
struct Account {
 identity:String,registration:u32,signed:String,
 prekeys:BTreeMap<u32,String>,kyber:BTreeMap<u32,String>,
 next:u32,pending:Vec<u32>,
}
impl Drop for Account{fn drop(&mut self){self.identity.zeroize();self.signed.zeroize();for v in self.prekeys.values_mut(){v.zeroize();}for v in self.kyber.values_mut(){v.zeroize();}}}
#[derive(Default)]struct OneTimeKem{records:BTreeMap<u32,KyberPreKeyRecord>}
#[async_trait(?Send)]impl KyberPreKeyStore for OneTimeKem {
 async fn get_kyber_pre_key(&self,id:KyberPreKeyId)->Result<KyberPreKeyRecord>{self.records.get(&id.into()).cloned().ok_or(SignalProtocolError::InvalidKyberPreKeyId)}
 async fn save_kyber_pre_key(&mut self,id:KyberPreKeyId,r:&KyberPreKeyRecord)->Result<()>{self.records.insert(id.into(),r.clone());Ok(())}
 async fn mark_kyber_pre_key_used(&mut self,id:KyberPreKeyId,_ec:SignedPreKeyId,_base:&PublicKey)->Result<()>{
  self.records.remove(&id.into()).ok_or(SignalProtocolError::InvalidKyberPreKeyId)?;Ok(())
 }
}
fn fill(account:&mut Account,count:usize,now:u64)->std::result::Result<(),E>{
 if count>24||account.prekeys.len()+count>64{return Err("Prekey limit".into())}
 let identity=IdentityKeyPair::try_from(dec(&account.identity)?.as_slice())?;
 let mut rng=rand::rngs::OsRng.unwrap_err();
 for _ in 0..count {
  let id=account.next;account.next=account.next.checked_add(1).ok_or("Prekey ID exhausted")?;
  let ec=KeyPair::generate(&mut rng);let pq=kem::KeyPair::generate(kem::KeyType::Kyber1024,&mut rng);
  let sig=identity.private_key().calculate_signature(&pq.public_key.serialize(),&mut rng)?;
  let record=KyberPreKeyRecord::new(id.into(),Timestamp::from_epoch_millis(now),&pq,&sig);
  account.prekeys.insert(id,enc(PreKeyRecord::new(id.into(),&ec).serialize()?));
  account.kyber.insert(id,enc(record.serialize()?));account.pending.push(id);
 }
 Ok(())
}
fn public(account:&Account)->std::result::Result<Value,E>{
 let identity=IdentityKeyPair::try_from(dec(&account.identity)?.as_slice())?;
 let signed=SignedPreKeyRecord::deserialize(&dec(&account.signed)?)?;
 let mut keys=Vec::new();
 for id in &account.pending {
  let ec=PreKeyRecord::deserialize(&dec(account.prekeys.get(id).ok_or("Missing EC prekey")?)?)?;
  let pq=KyberPreKeyRecord::deserialize(&dec(account.kyber.get(id).ok_or("Missing PQ prekey")?)?)?;
  keys.push(json!({"id":id,"key":enc(ec.public_key()?.serialize()),"kyber":enc(pq.public_key()?.serialize()),"kyberSignature":enc(pq.signature()?)}));
 }
 Ok(json!({"identity":enc(identity.identity_key().serialize()),"registration":account.registration,"signed":{"id":u32::from(signed.id()?),"key":enc(signed.public_key()?.serialize()),"signature":enc(signed.signature()?)},"keys":keys}))
}
fn field<'a>(v:&'a Value,k:&str)->std::result::Result<&'a str,E>{v[k].as_str().ok_or_else(||format!("Missing {k}").into())}
fn number(v:&Value,k:&str)->std::result::Result<u32,E>{Ok(v[k].as_u64().ok_or_else(||format!("Missing {k}"))?.try_into()?)}
fn bundle(v:&Value)->std::result::Result<PreKeyBundle,E>{
 let signed=&v["signed"];let key=&v["prekey"];
 Ok(PreKeyBundle::new(number(v,"registration")?,DeviceId::new(1)?,
  Some((number(key,"id")?.into(),PublicKey::deserialize(&dec(field(key,"key")?)?)?)),
  number(signed,"id")?.into(),PublicKey::deserialize(&dec(field(signed,"key")?)?)?,dec(field(signed,"signature")?)?.to_vec(),
  number(key,"id")?.into(),kem::PublicKey::deserialize(&dec(field(key,"kyber")?)?)?,dec(field(key,"kyberSignature")?)?.to_vec(),
  IdentityKey::decode(&dec(field(v,"identity")?)?)?)?)
}
fn operation(v:Value)->std::result::Result<Value,E>{
 let action=field(&v,"action")?;let now=v["now"].as_u64().ok_or("Missing timestamp")?;
 if now>9_007_199_254_740_991{return Err("Invalid timestamp".into())}
 let mut rng=rand::rngs::OsRng.unwrap_err();
 if action=="create" {
  let identity=IdentityKeyPair::generate(&mut rng);let signed=KeyPair::generate(&mut rng);
  let sig=identity.private_key().calculate_signature(&signed.public_key.serialize(),&mut rng)?;
  let signed=SignedPreKeyRecord::new(1.into(),Timestamp::from_epoch_millis(now),&signed,&sig);
  let mut account=Account{identity:enc(identity.serialize()),registration:rng.random_range(1..16380),signed:enc(signed.serialize()?),prekeys:BTreeMap::new(),kyber:BTreeMap::new(),next:1,pending:vec![]};
  fill(&mut account,v["count"].as_u64().unwrap_or(8) as usize,now)?;
  return Ok(json!({"account":account,"public":public(&account)?}))
 }
 let mut account:Account=serde_json::from_value(v["account"].clone())?;
 if action=="replenish" {fill(&mut account,v["count"].as_u64().unwrap_or(8) as usize,now)?;return Ok(json!({"account":account,"public":public(&account)?}))}
 if action=="public" {return public(&account)}
 if action=="published" {
  let ids:Vec<u32>=serde_json::from_value(v["ids"].clone())?;account.pending.retain(|id|!ids.contains(id));return Ok(json!({"account":account}))
 }
 let local=address(field(&v,"local")?)?;let remote=address(field(&v,"remote")?)?;
 let expected=IdentityKey::decode(&dec(field(&v,"expectedIdentity")?)?)?;
 let identity=IdentityKeyPair::try_from(dec(&account.identity)?.as_slice())?;
 let mut identities=InMemIdentityKeyStore::new(identity,account.registration);
 immediate(identities.save_identity(&remote,&expected))?;
 let mut sessions=InMemSessionStore::new();
 if let Some(s)=v["session"].as_str(){immediate(sessions.store_session(&remote,&SessionRecord::deserialize(&dec(s)?)?))?;}
 let time=SystemTime::UNIX_EPOCH+Duration::from_millis(now);
 let payload=if action=="encrypt" {
  if !v["bundle"].is_null(){immediate(process_prekey_bundle(&remote,&local,&mut sessions,&mut identities,&bundle(&v["bundle"] )?,time,&mut rng))?;}
  let plaintext=dec(field(&v,"plaintext")?)?;
  if plaintext.len()>20000{return Err("Plaintext limit".into())}
  let message=immediate(message_encrypt(&plaintext,&remote,&local,&mut sessions,&mut identities,time,&mut rng))?;
  json!({"type":message.message_type() as u8,"data":enc(message.serialize())})
 }else if action=="decrypt" {
  let data=dec(field(&v,"data")?)?;
  if data.len()>24000{return Err("Ciphertext limit".into())}
  let message=match number(&v,"type")?{2=>CiphertextMessage::SignalMessage(SignalMessage::try_from(data.as_slice())?),3=>CiphertextMessage::PreKeySignalMessage(PreKeySignalMessage::try_from(data.as_slice())?),_=>return Err("Unsupported message type".into())};
  let mut prekeys=InMemPreKeyStore::new();let mut signed=InMemSignedPreKeyStore::new();let mut kyber=OneTimeKem::default();
  for (id,data) in &account.prekeys{immediate(prekeys.save_pre_key((*id).into(),&PreKeyRecord::deserialize(&dec(data)?)?))?;}
  let record=SignedPreKeyRecord::deserialize(&dec(&account.signed)?)?;immediate(signed.save_signed_pre_key(record.id()?,&record))?;
  for (id,data) in &account.kyber{kyber.records.insert(*id,KyberPreKeyRecord::deserialize(&dec(data)?)?);}
  let plaintext=Zeroizing::new(immediate(message_decrypt(&message,&remote,&local,&mut sessions,&mut identities,&mut prekeys,&signed,&mut kyber,&mut rng))?);
  account.prekeys.retain(|id,_|prekeys.all_pre_key_ids().any(|x|u32::from(*x)==*id));
  account.kyber.retain(|id,_|kyber.records.contains_key(id));
  account.pending.retain(|id|account.prekeys.contains_key(id)&&account.kyber.contains_key(id));
  json!({"plaintext":enc(plaintext.as_slice())})
 }else{return Err("Unknown operation".into())};
 let session=immediate(sessions.load_session(&remote))?.ok_or("No resulting session")?;
 if session.session_version()? != 4{return Err("A PQXDH v4 session is required in this isolated preview".into())}
 if session.remote_identity_key_bytes()?.as_deref()!=Some(expected.serialize().as_ref()){return Err("Session identity mismatch".into())}
 Ok(json!({"account":account,"session":enc(session.serialize()?),"id":enc(session.alice_base_key()?),"version":session.session_version()?,"payload":payload}))
}
/// Request/response serialization is an adapter boundary, never a new cipher.
/// JS must wrap returned account/session state and commit it atomically.
#[cfg_attr(target_arch="wasm32",wasm_bindgen)]
 pub fn dispatch(input:&str)->String{
 let input=Zeroizing::new(input.to_owned());
 let result=(||{if input.len()>2_000_000{return Err("Input limit".into())}operation(serde_json::from_str(&input)? )})();
 match result {Ok(value)=>json!({"ok":true,"result":value}).to_string(),Err(e)=>json!({"ok":false,"error":e.to_string()}).to_string()}
}
