import {CHUNK_SIZE,MAX_FILE_SIZE} from '../public/attachments.js';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function attachmentRoutes({store,related,validateEnvelope,fail,body,env}){
  function quota(name,fallback){const value=Number(env[name]||fallback);if(!Number.isInteger(value)||value<10||value>65536)throw new Error(`${name} must be an integer between 10 and 65536 MB`);return value*1024*1024;}
  const userQuota=quota('ATTACHMENT_USER_QUOTA_MB',100),globalQuota=quota('ATTACHMENT_GLOBAL_QUOTA_MB',1024);
  return async(req,res,route,u,json)=>{
    if(route==='/attachments'&&req.method==='POST'){
      const b=await body(req);validateEnvelope(b.envelope,u.id);
      if(!uuid.test(b.id)||!Number.isSafeInteger(b.size)||b.size<=0||b.size>MAX_FILE_SIZE)fail(400,'Files must be between 1 byte and 10 MB');
      if(!related(u.id,b.envelope.to))fail(403,'Invite this person first');
      store.purge();const serialized=JSON.stringify(b.envelope),old=store.get('SELECT * FROM attachments WHERE id=? OR message_id=?',b.id,b.envelope.id);
      if(old){if(old.id!==b.id||old.sender!==u.id||old.size!==b.size||old.envelope!==serialized)fail(409,'Attachment identifier conflict');json(200,{id:b.id});return true;}
      if(store.get('SELECT id FROM messages WHERE id=?',b.envelope.id))fail(409,'Message already exists');
      const used=store.get('SELECT COALESCE(SUM(size),0) AS n FROM attachments WHERE sender=?',u.id).n;
      const total=store.get('SELECT COALESCE(SUM(size),0) AS n FROM attachments').n;
      if(used+b.size>userQuota||total+b.size>globalQuota)fail(413,'Attachment storage is full. Wait for existing files to disappear.');
      store.run('INSERT INTO attachments(id,message_id,sender,recipient,expires,size,envelope) VALUES(?,?,?,?,?,?,?)',b.id,b.envelope.id,u.id,b.envelope.to,b.envelope.expiresAt,b.size,serialized);
      json(201,{id:b.id});return true;
    }
    const match=route.match(/^\/attachments\/([a-f0-9-]{36})(?:\/chunks\/(\d{1,3}))?$/);
    if(!match)return false;
    const a=store.get('SELECT * FROM attachments WHERE id=? AND expires>?',match[1],Date.now());
    if(!a||![a.sender,a.recipient].includes(u.id)||!related(a.sender,a.recipient))fail(404,'Attachment unavailable or expired');
    if(req.method==='DELETE'&&!match[2]){
      if(a.sender!==u.id||a.committed)fail(403,'Only the sender can discard an unfinished transfer');
      store.run('DELETE FROM attachments WHERE id=?',a.id);json(200,{ok:true});return true;
    }
    const index=Number(match[2]);
    if(match[2]===undefined||index>=Math.ceil(a.size/CHUNK_SIZE))fail(404,'Chunk not found');
    if(req.method==='PUT'){
      if(a.sender!==u.id||a.committed)fail(403,'Attachment cannot be changed');
      const expected=Math.min(CHUNK_SIZE,a.size-index*CHUNK_SIZE)+16,parts=[];let length=0;
      for await(const part of req){length+=part.length;if(length>expected)fail(413,'Chunk too large');parts.push(part);}
      if(length!==expected)fail(400,'Incomplete chunk');
      if(a.expires<=Date.now())fail(410,'Attachment expired');
      if(!store.get('SELECT id FROM attachments WHERE id=? AND committed=0',a.id))fail(410,'Transfer was cancelled');
      const data=Buffer.concat(parts),prior=store.get('SELECT data FROM attachment_chunks WHERE attachment=? AND part=?',a.id,index);
      if(prior&&!Buffer.from(prior.data).equals(data))fail(409,'Chunk cannot be replaced');
      if(!prior)store.run('INSERT INTO attachment_chunks VALUES(?,?,?)',a.id,index,data);
      json(prior?200:201,{ok:true});return true;
    }
    if(req.method==='GET'){
      if(!a.committed)fail(404,'Attachment is not ready');
      const chunk=store.get('SELECT data FROM attachment_chunks WHERE attachment=? AND part=?',a.id,index);
      if(!chunk)fail(404,'Chunk unavailable');
      const bytes=Buffer.from(chunk.data);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':bytes.length});res.end(bytes);return true;
    }
    fail(405,'Method not allowed');
  };
}
