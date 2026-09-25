import {verifyWebhook,normalizeEmail,validEmail} from '@/lib/email-campaigns';
import {database} from '@/lib/storage';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
// Resend delivery events, verified with RESEND_WEBHOOK_SECRET. Hard bounces and spam complaints are suppressed
// so later campaigns skip them; this protects the sending domain's reputation.
export async function POST(req:Request){
 const body=await req.text();if(body.length>256000)return json({error:'Payload too large'},413);
 if(!await verifyWebhook(req.headers,body))return json({error:'Unauthorized'},401);
 type Event={type?:string;data?:{email_id?:unknown;to?:unknown;bounce?:{type?:string}}};
 let event:Event;try{event=JSON.parse(body)}catch{return json({error:'Invalid payload'},400)}
 const type=String(event?.type||''),data=event?.data||{},providerId=typeof data.email_id==='string'?data.email_id.slice(0,100):'';
 const emails:string[]=(Array.isArray(data.to)?data.to:[data.to]).map(normalizeEmail).filter(validEmail);
 try{const db=database(),now=Date.now(),statements=[];
  if(type==='email.bounced'&&data.bounce?.type!=='Transient'||type==='email.complained'){
   const reason=type==='email.complained'?'complaint':'bounce';
   for(const e of emails)statements.push(db.prepare('INSERT OR IGNORE INTO email_suppressions (email,reason,created) VALUES (?,?,?)').bind(e,reason,now),db.prepare("UPDATE email_recipients SET status='suppressed',updated=? WHERE email=? AND status='queued'").bind(now,e));
   if(providerId)statements.push(db.prepare('UPDATE email_recipients SET status=?,updated=? WHERE provider_id=?').bind(reason==='bounce'?'bounced':'complained',now,providerId));
  }else if(type==='email.delivered'&&providerId)statements.push(db.prepare("UPDATE email_recipients SET status='delivered',updated=? WHERE provider_id=? AND status='sent'").bind(now,providerId));
  if(statements.length)await db.batch(statements);
  return json({ok:true})}catch(e){console.error(e);return json({error:'Temporarily unavailable'},503)}}
