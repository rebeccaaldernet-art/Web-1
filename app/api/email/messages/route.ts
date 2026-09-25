import {emailOwner,emailJson,audit,sendDirect,loadSettings,readiness,fromHeader,htmlToText,normalizeEmail,validEmail,EMAIL_LIMITS} from '@/lib/email-campaigns';
import {database} from '@/lib/storage';
// One-off emails from the Compose screen. Bulk sends belong in campaigns (consent, unsubscribe, suppression),
// so a message is capped at 50 addresses and the workspace at 1,000 direct recipients per 24 hours.
const isId=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
type Row={id:string;status:string;error:string|null;updated:number};
const STUCK_MS=120000;
function addresses(v:unknown){if(v===undefined)return [];if(!Array.isArray(v)||v.length>EMAIL_LIMITS.directRecipients)return null;const out=v.map(normalizeEmail);return out.every(validEmail)?[...new Set(out)]:null}
export async function GET(req:Request){const a=await emailOwner();if(a.response)return a.response;try{const db=database(),u=new URL(req.url),id=u.searchParams.get('id');
 if(id){const m=await db.prepare('SELECT id,from_address,to_list,cc_list,bcc_list,subject,html,status,error,created FROM email_messages WHERE id=?').bind(id).first();return m?emailJson({message:m}):emailJson({error:'Message not found.'},404)}
 const before=Number(u.searchParams.get('before'))||Number.MAX_SAFE_INTEGER,q=(u.searchParams.get('q')||'').trim().toLowerCase().slice(0,100);
 const like='%'+q.replace(/[%_\\]/g,c=>'\\'+c)+'%';
 const messages=(await db.prepare(`SELECT id,to_list,cc_list,subject,substr(text,1,160) snippet,status,error,created FROM email_messages WHERE created<? ${q?"AND (lower(subject) LIKE ? ESCAPE '\\' OR to_list LIKE ? ESCAPE '\\' OR cc_list LIKE ? ESCAPE '\\')":''} ORDER BY created DESC LIMIT 50`).bind(...(q?[before,like,like,like]:[before])).all()).results;
 return emailJson({messages})}catch(e){console.error(e);return emailJson({error:'Sent mail is temporarily unavailable.'},503)}}
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return emailJson({error:'Invalid request origin.'},403);
 const a=await emailOwner();if(a.response)return a.response;
 let d:Record<string,unknown>;try{const v=await req.json();if(!v||typeof v!=="object"||Array.isArray(v))throw Error();d=v as Record<string,unknown>}catch{return emailJson({error:'Invalid request.'},400)}
 if(d.action!=='send')return emailJson({error:'Unknown action.'},400);
 if(!isId(d.id))return emailJson({error:'Refresh the page and try again.'},400);
 const to=addresses(d.to),cc=addresses(d.cc),bcc=addresses(d.bcc);
 if(!to||!cc||!bcc)return emailJson({error:'One or more addresses are not valid email addresses.'},400);
 if(!to.length)return emailJson({error:'Add at least one recipient in To.'},400);
 const count=to.length+cc.length+bcc.length;if(count>EMAIL_LIMITS.directRecipients)return emailJson({error:`A single email can go to at most ${EMAIL_LIMITS.directRecipients} addresses. Use a campaign for larger audiences.`},400);
 const subject=typeof d.subject==='string'?d.subject.replace(/[\r\n]+/g,' ').trim():'',html=typeof d.html==='string'?d.html:'';
 if(subject.length>EMAIL_LIMITS.subject||html.length>EMAIL_LIMITS.html)return emailJson({error:'The subject or message is too long.'},400);
 const text=htmlToText(html);if(!subject&&!text)return emailJson({error:'Write a subject or a message before sending.'},400);
 try{const db=database(),now=Date.now();
  const settings=await loadSettings();if(!settings||!validEmail(settings.from_email)||!settings.from_name)return emailJson({error:'Set your sender name and address in Email settings first.'},409);
  if(!readiness().provider&&!readiness().cloudflare)return emailJson({error:'No email sender is connected yet. Connect your mail server or Cloudflare Email Service in Email settings.'},503);
  const existing=await db.prepare('SELECT id,status,error,updated FROM email_messages WHERE id=?').bind(d.id).first<Row>();
  const retryable=existing&&(existing.status==='failed'||existing.status==='sending'&&existing.updated<now-STUCK_MS);
  if(existing&&!retryable)return existing.status==='sent'?emailJson({ok:true,id:existing.id,status:'sent'}):emailJson({error:'This email is already being sent.'},409);
  if(!existing){
   const used=await db.prepare('SELECT COALESCE(SUM(recipient_count),0) total FROM email_messages WHERE created>? AND status<>\'failed\'').bind(now-86400000).first<{total:number}>();
   if((used?.total||0)+count>EMAIL_LIMITS.directRecipientsPerDay)return emailJson({error:`Direct email is limited to ${EMAIL_LIMITS.directRecipientsPerDay.toLocaleString()} recipients per 24 hours. Use a campaign for bulk sending.`},429);
   await db.prepare("INSERT INTO email_messages (id,sender,from_address,to_list,cc_list,bcc_list,recipient_count,subject,html,text,status,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,'sending',?,?)").bind(d.id,a.member.id,fromHeader(settings),JSON.stringify(to),JSON.stringify(cc),JSON.stringify(bcc),count,subject,html,text,now,now).run();
  }else{
   // Retrying a failed send reuses the stored message and the same idempotency key.
   const r=await db.prepare("UPDATE email_messages SET status='sending',error=NULL,updated=? WHERE id=? AND (status='failed' OR status='sending' AND updated<?)").bind(now,d.id,now-STUCK_MS).run();if(!r.meta.changes)return emailJson({error:'This email is already being sent.'},409);
  }
  const m=await db.prepare('SELECT * FROM email_messages WHERE id=?').bind(d.id).first<{to_list:string;cc_list:string;bcc_list:string;subject:string;html:string;text:string;from_address:string}>();
  const ccList=JSON.parse(m!.cc_list),bccList=JSON.parse(m!.bcc_list);
  const result=await sendDirect({fromName:settings.from_name,fromEmail:settings.from_email,to:JSON.parse(m!.to_list),cc:ccList,bcc:bccList,replyTo:settings.reply_to,subject:m!.subject||'(no subject)',html:m!.html||'<p></p>',text:m!.text},'direct:'+d.id);
  if(result.ok){await db.prepare("UPDATE email_messages SET status='sent',provider_id=?,updated=? WHERE id=?").bind(result.ids[0]||null,Date.now(),d.id).run();await audit(a.member.id,'directSend','',`${count} recipients`);return emailJson({ok:true,id:d.id,status:'sent'})}
  await db.prepare("UPDATE email_messages SET status='failed',error=?,updated=? WHERE id=?").bind(result.error,Date.now(),d.id).run();
  return emailJson({error:'Not sent: '+result.error,id:d.id,status:'failed',retry:result.retry},502);
 }catch(e){console.error(e);return emailJson({error:'The email could not be sent. Try again.'},503)}
}
