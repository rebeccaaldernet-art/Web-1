import {workspaceAccess} from '@/lib/access';
import {database} from '@/lib/storage';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Invalid request origin.'},403);
 const auth=await workspaceAccess();if(auth.response)return auth.response;
 if(Number(req.headers.get('content-length')||0)>1024)return json({error:'Invalid presence update.'},400);
 let body:{sessionId?:unknown;sequence?:unknown;active?:unknown};
 try{const raw=await req.text();if(raw.length>1024)return json({error:'Invalid presence update.'},400);body=JSON.parse(raw);if(!body||typeof body!=='object')throw Error();}catch{return json({error:'Invalid presence update.'},400)}
 const {sessionId,sequence,active}=body;
 if(typeof sessionId!=='string'||!/^[a-f0-9-]{36}$/i.test(sessionId)||typeof sequence!=='number'||!Number.isSafeInteger(sequence)||sequence<1||typeof active!=='boolean')return json({error:'Invalid presence update.'},400);
 try{
  const db=database(),now=Date.now();
  await db.batch([
   db.prepare('INSERT INTO member_presence (member_id,session_id,sequence,active,seen) VALUES (?,?,?,?,?) ON CONFLICT(member_id,session_id) DO UPDATE SET sequence=excluded.sequence,active=excluded.active,seen=excluded.seen WHERE excluded.sequence>member_presence.sequence').bind(auth.member.id,sessionId,sequence,active?1:0,now),
   db.prepare('DELETE FROM member_presence WHERE seen<? AND seen<(SELECT MAX(recent.seen) FROM member_presence recent WHERE recent.member_id=member_presence.member_id)').bind(now-86400000)
  ]);
  const result=await db.prepare("SELECT m.id AS memberId,m.user_id AS userId,MAX(p.seen) AS lastSeen,MAX(CASE WHEN p.active=1 AND p.seen>? THEN p.seen ELSE NULL END) AS onlineSeen FROM members m LEFT JOIN member_presence p ON p.member_id=m.id WHERE m.status='active' GROUP BY m.id,m.user_id").bind(now-75000).all<{memberId:string;userId:string|null;lastSeen:number|null;onlineSeen:number|null}>();
  return json({people:result.results.map(p=>({memberId:p.memberId,userId:p.userId,lastSeen:p.lastSeen,remainingMs:p.onlineSeen===null?0:Math.max(0,p.onlineSeen+75000-now)}))});
 }catch{return json({error:'Online status is temporarily unavailable.'},503)}
}
