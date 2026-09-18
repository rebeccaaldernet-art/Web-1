import {workspaceAccess} from '@/lib/access';
import {database} from '@/lib/storage';
export async function GET(){
 try{const auth=await workspaceAccess('readMessages');if(auth.response)return auth.response;
 const mentioned="(json_extract(m.mentions,'$.all')=1 OR EXISTS (SELECT 1 FROM json_each(m.mentions,'$.members') tag WHERE json_extract(tag.value,'$.id')=?))";
 const result=await database().prepare('SELECT n.channel,COUNT(*) AS count,MAX(n.seq) AS latest,SUM(CASE WHEN ' + mentioned + ' THEN 1 ELSE 0 END) AS mentions FROM message_notifications n JOIN messages m ON m.id=n.message_id LEFT JOIN channel_reads r ON r.channel=n.channel AND r.user_id=? WHERE n.sender<>? AND n.seq>COALESCE(r.last_seq,0) GROUP BY n.channel').bind(auth.member!.id,auth.user!.userId,auth.user!.userId).all<{channel:string;count:number;mentions:number;latest:number}>();
 const alerts=await database().prepare("SELECT m.id,m.author,n.channel FROM message_notifications n JOIN messages m ON m.id=n.message_id LEFT JOIN channel_reads r ON r.channel=n.channel AND r.user_id=? WHERE n.sender<>? AND n.seq>COALESCE(r.last_seq,0) AND "+mentioned+" ORDER BY n.seq DESC LIMIT 20").bind(auth.user!.userId,auth.user!.userId,auth.member!.id).all<{id:string;author:string;channel:string}>();
 const direct=await database().prepare('SELECT m.thread,COUNT(*) AS count,MAX(m.seq) AS latest FROM direct_messages m JOIN direct_threads t ON t.id=m.thread LEFT JOIN direct_reads r ON r.thread=t.id AND r.member_id=? WHERE (t.member_a=? OR t.member_b=?) AND m.sender<>? AND m.seq>COALESCE(r.last_seq,0) GROUP BY m.thread').bind(auth.member!.id,auth.member!.id,auth.member!.id,auth.member!.id).all<{thread:string;count:number;latest:number}>();
 return Response.json({directSeq:Math.max(0,...direct.results.map(r=>r.latest)),directCounts:Object.fromEntries(direct.results.map(r=>[r.thread,r.count])),newestSeq:Math.max(0,...result.results.map(r=>r.latest)),mentions:Object.fromEntries(result.results.map(r=>[r.channel,r.mentions])),alerts:alerts.results,counts:Object.fromEntries(result.results.map(r=>[r.channel,r.count])),total:result.results.reduce((sum,r)=>sum+r.count,0)},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){console.error(e);return Response.json({error:'Unread counts are temporarily unavailable.'},{status:503});}
}
export async function POST(req:Request){
 try{const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
 const auth=await workspaceAccess('readMessages');if(auth.response)return auth.response;
 let data:{channel?:unknown;through?:unknown};try{data=await req.json() as typeof data;}catch{return Response.json({error:'Invalid read request.'},{status:400});}
 if(!data||typeof data.channel!=='string'||typeof data.through!=='number'||!Number.isSafeInteger(data.through)||data.through<0)return Response.json({error:'Invalid read request.'},{status:400});
 const db=database();if(!await db.prepare('SELECT id FROM channels WHERE id=?').bind(data.channel).first())return Response.json({error:'Channel not found.'},{status:404});
 // Clamp to a real sequence and never move backwards across tabs/devices.
 await db.prepare('INSERT INTO channel_reads (user_id,channel,last_seq) SELECT ?,?,MIN(?,COALESCE(MAX(seq),0)) FROM message_notifications WHERE channel=? ON CONFLICT(user_id,channel) DO UPDATE SET last_seq=MAX(channel_reads.last_seq,excluded.last_seq)').bind(auth.user!.userId,data.channel,data.through,data.channel).run();
 return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){console.error(e);return Response.json({error:'Could not mark this channel as read.'},{status:503});}
}
