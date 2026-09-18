import {workspaceAccess} from '@/lib/access';
import {database} from '@/lib/storage';
const headers={'Cache-Control':'private, no-store'};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers});
export async function GET(req:Request){
 try{
  const auth=await workspaceAccess('readMessages');if(auth.response)return auth.response;
  const me=auth.member!.id,db=database(),url=new URL(req.url),thread=url.searchParams.get('thread');
  if(!thread){
   const members=await db.prepare("SELECT id,user_id,name,role FROM members WHERE status='active' ORDER BY name").all();
   const threads=await db.prepare("SELECT t.id,p.name,p.id AS memberId,p.status,COALESCE(MAX(m.seq),0) AS latest,SUM(CASE WHEN m.sender<>? AND m.seq>COALESCE(r.last_seq,0) THEN 1 ELSE 0 END) AS unread FROM direct_threads t JOIN members p ON p.id=CASE WHEN t.member_a=? THEN t.member_b ELSE t.member_a END LEFT JOIN direct_messages m ON m.thread=t.id LEFT JOIN direct_reads r ON r.thread=t.id AND r.member_id=? WHERE t.member_a=? OR t.member_b=? GROUP BY t.id ORDER BY latest DESC,t.created DESC").bind(me,me,me,me,me).all();
   return json({members:members.results,threads:threads.results,me});
  }
  const access=await db.prepare('SELECT id FROM direct_threads WHERE id=? AND (member_a=? OR member_b=?)').bind(thread,me,me).first();
  if(!access)return json({error:'Conversation not found.'},404);
  if(url.searchParams.has('after')){
   const after=Number(url.searchParams.get('after'));if(!Number.isSafeInteger(after)||after<0)return json({error:'Invalid message cursor.'},400);
   const messages=await db.prepare('SELECT m.*,p.name AS author FROM direct_messages m JOIN members p ON p.id=m.sender WHERE m.thread=? AND m.seq>? ORDER BY m.seq LIMIT 200').bind(thread,after).all();
   return json({messages:messages.results});
  }
  const before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);
  if(!Number.isSafeInteger(before)||before<1)return json({error:'Invalid message cursor.'},400);
  const messages=await db.prepare('SELECT * FROM (SELECT m.*,p.name AS author FROM direct_messages m JOIN members p ON p.id=m.sender WHERE m.thread=? AND m.seq<? ORDER BY m.seq DESC LIMIT 200) ORDER BY seq').bind(thread,before).all();
  return json({messages:messages.results});
 }catch(e){console.error(e);return json({error:'Private conversations could not load. Please try again.'},503)}
}
export async function POST(req:Request){
 try{
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Invalid request origin.'},403);
  const auth=await workspaceAccess('readMessages');if(auth.response)return auth.response;
  let data:Record<string,unknown>;try{data=await req.json();if(!data||typeof data!=='object'||Array.isArray(data))throw Error()}catch{return json({error:'Invalid request.'},400)}
  const me=auth.member!.id,db=database();
  if(data.action==='open'){
   const send=await workspaceAccess('sendMessages');if(send.response)return send.response;
   if(typeof data.memberId!=='string'&&typeof data.userId!=='string')return json({error:'Choose a member.'},400);
   const person=await db.prepare("SELECT id FROM members WHERE status='active' AND "+(typeof data.memberId==='string'?'id=?':'user_id=?')).bind(data.memberId??data.userId).first<{id:string}>();
   if(!person||person.id===me)return json({error:'Choose another active workspace member.'},400);
   const pair=[me,person.id].sort(),id=JSON.stringify(pair);
   await db.prepare('INSERT OR IGNORE INTO direct_threads (id,member_a,member_b,created) VALUES (?,?,?,?)').bind(id,...pair,Date.now()).run();
   return json({id});
  }
  if(typeof data.thread!=='string')return json({error:'Choose a conversation.'},400);
  const thread=await db.prepare('SELECT member_a,member_b FROM direct_threads WHERE id=? AND (member_a=? OR member_b=?)').bind(data.thread,me,me).first<{member_a:string;member_b:string}>();
  if(!thread)return json({error:'Conversation not found.'},404);
  if(data.action==='read'){
   if(typeof data.through!=='number'||!Number.isSafeInteger(data.through)||data.through<0)return json({error:'Invalid read cursor.'},400);
   await db.prepare('INSERT INTO direct_reads (member_id,thread,last_seq) SELECT ?,?,MIN(?,COALESCE(MAX(seq),0)) FROM direct_messages WHERE thread=? ON CONFLICT(member_id,thread) DO UPDATE SET last_seq=MAX(direct_reads.last_seq,excluded.last_seq)').bind(me,data.thread,data.through,data.thread).run();
   return json({ok:true});
  }
  if(data.action!=='send')return json({error:'Unknown action.'},400);
  const send=await workspaceAccess('sendMessages');if(send.response)return send.response;
  const peer=thread.member_a===me?thread.member_b:thread.member_a;
  if(!await db.prepare("SELECT id FROM members WHERE id=? AND status='active'").bind(peer).first())return json({error:'This member no longer has workspace access.'},403);
  if(typeof data.body!=='string'||!data.body.trim()||data.body.trim().length>10000||typeof data.requestId!=='string'||!/^[a-zA-Z0-9-]{12,80}$/.test(data.requestId))return json({error:'Enter a message of up to 10,000 characters.'},400);
  const prior=await db.prepare('SELECT sender,thread FROM direct_messages WHERE id=?').bind(data.requestId).first<{sender:string;thread:string}>();
  if(prior)return prior.sender===me&&prior.thread===data.thread?json({ok:true}):json({error:'Message ID is in use.'},409);
  await db.prepare('INSERT INTO direct_messages (id,thread,sender,body,created) VALUES (?,?,?,?,?)').bind(data.requestId,data.thread,me,data.body.trim(),Date.now()).run();
  return json({ok:true});
 }catch(e){console.error(e);return json({error:'Could not save your private message. Please try again.'},503)}
}
