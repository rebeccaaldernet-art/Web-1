import {env} from 'cloudflare:workers';
import {workspaceAccess} from './access';
import {database} from './storage';
// Bulk email campaigns. Delivery goes through Resend's HTTP batch API (100 messages per call) using a Worker secret;
// Gmail/Workspace mailboxes are capped at a few thousand messages per day and are not a bulk-sending channel.
// Sending is owner-only, needs a test send of the exact revision, and an explicit recipient-count confirmation.
export const EMAIL_LIMITS={recipientsPerCampaign:200000,directRecipients:50,directRecipientsPerDay:1000,recipientsPerUpload:1000,batchSize:100,batchesPerDispatch:5,subject:200,html:200000,text:100000,name:120,leaseMs:120000,maxAttempts:5};
export const emailJson=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function emailOwner(){const a=await workspaceAccess();if(a.response)return a;if(a.member.role!=='owner')return {response:emailJson({error:'Email campaigns are restricted to the workspace owner.'},403)};return a}
type Secrets={RESEND_API_KEY?:string;EMAIL_LINK_SECRET?:string;RESEND_WEBHOOK_SECRET?:string};
export const secrets=()=>env as unknown as Secrets;
export function readiness(){const s=secrets();return {provider:typeof s.RESEND_API_KEY==='string'&&s.RESEND_API_KEY.length>=10,links:typeof s.EMAIL_LINK_SECRET==='string'&&s.EMAIL_LINK_SECRET.length>=32,webhook:typeof s.RESEND_WEBHOOK_SECRET==='string'&&s.RESEND_WEBHOOK_SECRET.startsWith('whsec_')}}
export type Settings={from_name:string;from_email:string;reply_to:string;postal_address:string};
export type Campaign={id:string;name:string;subject:string;html:string;text:string;state:'draft'|'sending'|'paused'|'complete'|'cancelled';revision:number;tested_revision:number;link_origin:string;created:number;updated:number;owner:string};
export type Recipient={id:number;campaign:string;email:string;name:string;status:string;lease:string|null;attempts:number};
export const normalizeEmail=(v:unknown)=>typeof v==='string'?v.trim().toLowerCase():'';
export const validEmail=(v:string)=>v.length<=254&&/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:.]{2,}$/.test(v);
export const cleanName=(v:unknown)=>typeof v==='string'?v.replace(/[<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,EMAIL_LIMITS.name):'';
export async function audit(actor:string,action:string,campaign='',detail=''){await database().prepare('INSERT INTO email_audit (id,actor,action,campaign,detail,created) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,campaign,detail.slice(0,500),Date.now()).run()}
export async function loadSettings(){return await database().prepare("SELECT from_name,from_email,reply_to,postal_address FROM email_settings WHERE id='workspace'").first<Settings>()}
export const settingsComplete=(s:Settings|null):s is Settings=>!!s&&validEmail(s.from_email)&&s.from_name.length>0&&s.postal_address.trim().length>=10;
export async function counts(campaign:string){const rows=(await database().prepare('SELECT status,COUNT(*) total FROM email_recipients WHERE campaign=? GROUP BY status').bind(campaign).all<{status:string;total:number}>()).results;return Object.fromEntries(rows.map(r=>[r.status,r.total])) as Record<string,number>}

const b64url=(bytes:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function hmac(secret:string,value:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64url(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))}
function same(a:string,b:string){if(a.length!==b.length)return false;let m=0;for(let i=0;i<a.length;i++)m|=a.charCodeAt(i)^b.charCodeAt(i);return m===0}
// Unsubscribe links carry the recipient row id only (no email address), signed with EMAIL_LINK_SECRET.
export async function unsubscribeToken(recipient:number){const s=secrets().EMAIL_LINK_SECRET;if(!s||s.length<32)throw Error('EMAIL_LINK_SECRET is not configured');return hmac(s,'unsubscribe:v1:'+recipient)}
export async function verifyUnsubscribe(recipient:number,token:string){try{return same(await unsubscribeToken(recipient),token)}catch{return false}}
export async function unsubscribeUrl(origin:string,recipient:number){return `${origin}/api/email/unsubscribe?r=${recipient}&t=${await unsubscribeToken(recipient)}`}

const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function htmlToText(html:string){return html.replace(/<(style|script)[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|h\d|li|tr)>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\n{3,}/g,'\n\n').trim()}
// {{name}} and {{email}} are the only merge fields. HTML values are escaped; the footer is always appended.
export function renderMessage(c:Pick<Campaign,'subject'|'html'|'text'>,settings:Settings,r:{email:string;name:string},link:string){
 const fill=(s:string,html:boolean)=>s.replace(/\{\{\s*(name|email)\s*\}\}/gi,(_,k:string)=>{const v=k.toLowerCase()==='email'?r.email:r.name||'there';return html?escapeHtml(v):v});
 const address=settings.postal_address.trim();
 const html=fill(c.html,true)+`<hr style="margin-top:32px;border:none;border-top:1px solid #ddd"><p style="font-size:12px;color:#666;line-height:1.5">${escapeHtml(settings.from_name)} · ${escapeHtml(address).replace(/\n/g,'<br>')}<br>You are receiving this because you opted in to hear from us. <a href="${escapeHtml(link)}">Unsubscribe</a></p>`;
 const text=fill(c.text||htmlToText(c.html),false)+`\n\n--\n${settings.from_name} · ${address}\nUnsubscribe: ${link}`;
 return {subject:fill(c.subject,false).replace(/[\r\n]+/g,' '),html,text};
}
export const fromHeader=(s:Pick<Settings,"from_name"|"from_email">)=>`${s.from_name.replace(/["\r\n]/g,'')} <${s.from_email}>`;

export type SendResult={ok:true;ids:string[]}|{ok:false;retry:boolean;status:number;error:string};
// One Resend batch call. The idempotency key makes a retried lease safe: Resend replays the first result for 24h.
export async function sendBatch(messages:Record<string,unknown>[],idempotencyKey:string):Promise<SendResult>{
 const key=secrets().RESEND_API_KEY;if(!key)return {ok:false,retry:false,status:0,error:'RESEND_API_KEY is not configured.'};
 let r:Response;try{r=await fetch('https://api.resend.com/emails/batch',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify(messages)})}catch{return {ok:false,retry:true,status:0,error:'Email provider could not be reached.'}}
 let body:{data?:{id?:string}[];message?:string;error?:string}|null=null;try{body=await r.json()}catch{}
 if(r.ok&&Array.isArray(body?.data)&&body.data.length===messages.length)return {ok:true,ids:body.data.map(d=>String(d?.id||''))};
 const error=String(body?.message||body?.error||`Email provider returned ${r.status}.`).slice(0,300);
 return {ok:false,retry:r.status===429||r.status>=500||r.ok,status:r.status,error};
}
async function buildMessages(c:Campaign,settings:Settings,rows:Recipient[]){
 return Promise.all(rows.map(async r=>{const link=await unsubscribeUrl(c.link_origin,r.id);const m=renderMessage(c,settings,r,link);return {from:fromHeader(settings),to:[r.email],subject:m.subject,html:m.html,text:m.text,...(settings.reply_to?{reply_to:settings.reply_to}:{}),headers:{'List-Unsubscribe':`<${link}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},tags:[{name:'campaign',value:c.id.replace(/[^a-zA-Z0-9_-]/g,'')}]}}));
}
async function deliverLease(c:Campaign,settings:Settings,lease:string){
 const db=database();
 // Anyone who unsubscribed or bounced after upload is skipped before the provider call.
 await db.prepare("UPDATE email_recipients SET status='suppressed',lease=NULL,updated=? WHERE lease=? AND status='sending' AND email IN (SELECT email FROM email_suppressions)").bind(Date.now(),lease).run();
 const rows=(await db.prepare("SELECT id,campaign,email,name,status,lease,attempts FROM email_recipients WHERE lease=? AND status='sending' ORDER BY id").bind(lease).all<Recipient>()).results;
 if(!rows.length)return {sent:0,stop:false};
 const result=await sendBatch(await buildMessages(c,settings,rows),`${c.id}:${lease}`);
 const now=Date.now();
 if(result.ok){await db.batch(rows.map((r,i)=>db.prepare("UPDATE email_recipients SET status='sent',provider_id=?,error=NULL,updated=? WHERE id=? AND lease=?").bind(result.ids[i]||null,now,r.id,lease)));return {sent:rows.length,stop:false}}
 if(!result.retry){await db.prepare("UPDATE email_recipients SET status='failed',error=?,updated=? WHERE lease=? AND status='sending'").bind(result.error,now,lease).run();return {sent:0,stop:false,error:result.error}}
 // Keep the lease so the next dispatch retries with the same idempotency key; give up after maxAttempts.
 await db.prepare("UPDATE email_recipients SET status=CASE WHEN attempts>=? THEN 'failed' ELSE status END,error=?,updated=? WHERE lease=? AND status='sending'").bind(EMAIL_LIMITS.maxAttempts,'Retrying: '+result.error,now,lease).run();
 return {sent:0,stop:true,error:result.error};
}
// Sends up to batchesPerDispatch batches for one campaign. Called repeatedly by the owner's open campaign page.
export async function dispatch(campaignId:string){
 const db=database();
 const c=await db.prepare('SELECT * FROM email_campaigns WHERE id=?').bind(campaignId).first<Campaign>();
 if(!c)return {error:'Campaign not found.',status:404};
 if(c.state!=='sending')return {state:c.state,sent:0,counts:await counts(c.id)};
 const settings=await loadSettings();if(!settingsComplete(settings))return {error:'Sender settings are incomplete.',status:409};
 const r=readiness();if(!r.provider||!r.links)return {error:'Email provider secrets are not configured on this deployment.',status:503};
 let sent=0,error:string|undefined;
 for(let i=0;i<EMAIL_LIMITS.batchesPerDispatch;i++){
  const now=Date.now();
  let lease=(await db.prepare("SELECT lease FROM email_recipients WHERE campaign=? AND status='sending' AND leased<? LIMIT 1").bind(c.id,now-EMAIL_LIMITS.leaseMs).first<{lease:string}>())?.lease;
  if(lease)await db.prepare("UPDATE email_recipients SET leased=?,attempts=attempts+1 WHERE lease=? AND status='sending'").bind(now,lease).run();
  else{
   lease=crypto.randomUUID();
   const claimed=await db.prepare("UPDATE email_recipients SET status='sending',lease=?,leased=?,attempts=attempts+1,updated=? WHERE status='queued' AND id IN (SELECT id FROM email_recipients WHERE campaign=? AND status='queued' ORDER BY id LIMIT ?)").bind(lease,now,now,c.id,EMAIL_LIMITS.batchSize).run();
   if(!claimed.meta.changes)break;
  }
  const out=await deliverLease(c,settings,lease);sent+=out.sent;if(out.error)error=out.error;if(out.stop)break;
 }
 const totals=await counts(c.id);
 let state:Campaign['state']=c.state;
 if(!totals.queued&&!totals.sending){const done=await db.prepare("UPDATE email_campaigns SET state='complete',updated=? WHERE id=? AND state='sending'").bind(Date.now(),c.id).run();if(done.meta.changes){state='complete';await audit(c.owner,'complete',c.id,JSON.stringify(totals))}}
 return {state,sent,counts:totals,...(error?{warning:error}:{})};
}
export async function testSend(c:Campaign,settings:Settings,to:string,origin:string){
 // Test messages use recipient id 0, which the unsubscribe page recognises as a preview link.
 const link=await unsubscribeUrl(origin,0);const m=renderMessage(c,settings,{email:to,name:'Test Recipient'},link);
 return sendBatch([{from:fromHeader(settings),to:[to],subject:'[Test] '+m.subject,html:m.html,text:m.text,...(settings.reply_to?{reply_to:settings.reply_to}:{})}],`${c.id}:test:${c.revision}:${crypto.randomUUID()}`);
}
// Resend signs webhooks with Svix: base64 HMAC-SHA256 of "id.timestamp.body" using the whsec_ secret.
export async function verifyWebhook(headers:Headers,body:string,now=Date.now()){
 const secret=secrets().RESEND_WEBHOOK_SECRET;if(!secret?.startsWith('whsec_'))return false;
 const id=headers.get('svix-id'),ts=headers.get('svix-timestamp'),sig=headers.get('svix-signature');if(!id||!ts||!sig)return false;
 if(!/^\d+$/.test(ts)||Math.abs(now/1000-Number(ts))>300)return false;
 let raw:Uint8Array<ArrayBuffer>;try{raw=Uint8Array.from(atob(secret.slice(6)),c=>c.charCodeAt(0))}catch{return false}
 const key=await crypto.subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const expected=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${id}.${ts}.${body}`)))));
 return sig.split(' ').some(part=>{const [version,value]=part.split(',');return version==='v1'&&typeof value==='string'&&same(value,expected)});
}
