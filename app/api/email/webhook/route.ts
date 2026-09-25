import {verifyWebhook,normalizeEmail,validEmail} from '@/lib/email-campaigns';
import {database} from '@/lib/storage';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
// Delivery reports from the self-hosted mailer, signed with MAILER_SECRET and sent in batches of up to 100.
// Hard bounces and complaints are suppressed so later campaigns skip them; this protects the domain's reputation.
type MailerEvent={type?:string;email_id?:unknown;to?:unknown;bounce?:{type?:string;message?:string};error?:string};
export async function POST(req:Request){
 const body=await req.text();if(body.length>1000000)return json({error:'Payload too large'},413);
 if(!await verifyWebhook(req.headers,body))return json({error:'Unauthorized'},401);
 let events:MailerEvent[];try{const d=JSON.parse(body);events=Array.isArray(d?.events)?d.events.slice(0,500):[d]}catch{return json({error:'Invalid payload'},400)}
 try{const db=database(),now=Date.now(),statements=[];
  for(const event of events){
   const type=String(event?.type||''),providerId=typeof event?.email_id==='string'?event.email_id.slice(0,100):'';
   const emails:string[]=(Array.isArray(event?.to)?event.to:[event?.to]).map(normalizeEmail).filter(validEmail);
   if(type==='email.bounced'&&event.bounce?.type!=='Transient'||type==='email.complained'){
    const reason=type==='email.complained'?'complaint':'bounce';
    for(const e of emails)statements.push(db.prepare('INSERT OR IGNORE INTO email_suppressions (email,reason,created) VALUES (?,?,?)').bind(e,reason,now),db.prepare("UPDATE email_recipients SET status='suppressed',updated=? WHERE email=? AND status='queued'").bind(now,e));
    if(providerId)statements.push(db.prepare('UPDATE email_recipients SET status=?,updated=? WHERE provider_id=?').bind(reason==='bounce'?'bounced':'complained',now,providerId),db.prepare('UPDATE email_messages SET status=?,error=?,updated=? WHERE provider_id=?').bind(reason==='bounce'?'bounced':'complained',String(event.bounce?.message||'').slice(0,300)||null,now,providerId));
   }else if(type==='email.delivered'&&providerId)statements.push(db.prepare("UPDATE email_recipients SET status='delivered',updated=? WHERE provider_id=? AND status='sent'").bind(now,providerId),db.prepare("UPDATE email_messages SET status='delivered',updated=? WHERE provider_id=? AND status='sent'").bind(now,providerId));
   // The mailer retried for MAX_RETRY_HOURS without a final answer from the recipient's server.
   else if(type==='email.failed'&&providerId)statements.push(db.prepare("UPDATE email_recipients SET status='failed',error=?,updated=? WHERE provider_id=? AND status='sent'").bind(String(event.error||'Not delivered after retries').slice(0,300),now,providerId),db.prepare("UPDATE email_messages SET status='failed',error=?,updated=? WHERE provider_id=? AND status IN ('sent','delivered')").bind(String(event.error||'Not delivered after retries').slice(0,300),now,providerId));
  }
  if(statements.length)await db.batch(statements);
  return json({ok:true})}catch(e){console.error(e);return json({error:'Temporarily unavailable'},503)}}
