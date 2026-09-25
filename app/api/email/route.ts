import {emailOwner,emailJson,audit,counts,dispatch,testSend,loadSettings,settingsComplete,readiness,normalizeEmail,validEmail,cleanName,EMAIL_LIMITS,type Campaign} from '@/lib/email-campaigns';
import {database} from '@/lib/storage';
const isId=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const str=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max?v:null;
export async function GET(req:Request){const a=await emailOwner();if(a.response)return a.response;try{const db=database(),id=new URL(req.url).searchParams.get('campaign');
 if(id){const c=await db.prepare('SELECT * FROM email_campaigns WHERE id=?').bind(id).first<Campaign>();if(!c)return emailJson({error:'Campaign not found.'},404);
  const failures=(await db.prepare("SELECT email,error FROM email_recipients WHERE campaign=? AND status='failed' ORDER BY updated DESC LIMIT 20").bind(id).all()).results;
  return emailJson({campaign:c,counts:await counts(id),failures})}
 const campaigns=(await db.prepare('SELECT id,name,subject,state,revision,tested_revision,created,updated FROM email_campaigns ORDER BY created DESC LIMIT 100').all()).results;
 const suppressed=await db.prepare('SELECT COUNT(*) total FROM email_suppressions').first<{total:number}>();
 return emailJson({settings:await loadSettings(),campaigns,suppressed:suppressed?.total||0,readiness:readiness(),limits:EMAIL_LIMITS,ownerEmail:a.member.email,audit:(await db.prepare('SELECT action,campaign,detail,created FROM email_audit ORDER BY created DESC LIMIT 50').all()).results})
}catch(e){console.error(e);return emailJson({error:'Email campaigns are temporarily unavailable.'},503)}}

export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return emailJson({error:'Invalid request origin.'},403);
 const a=await emailOwner();if(a.response)return a.response;const actor=a.member.id;
 let d:Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- validated field by field below
try{const v=await req.json();if(!v||typeof v!=='object'||Array.isArray(v))throw Error();d=v}catch{return emailJson({error:'Invalid request.'},400)}
 try{const db=database(),now=Date.now();
 if(d.action==='settings'){
  const s={from_name:cleanName(d.from_name),from_email:normalizeEmail(d.from_email),reply_to:normalizeEmail(d.reply_to),postal_address:typeof d.postal_address==='string'?d.postal_address.trim().slice(0,500):''};
  if(!s.from_name||!validEmail(s.from_email))return emailJson({error:'Enter a sender name and a sender address on your verified sending domain.'},400);
  if(s.reply_to&&!validEmail(s.reply_to))return emailJson({error:'Enter a valid reply-to address or leave it empty.'},400);
  if(s.postal_address.length<10)return emailJson({error:'A physical postal address is required in every marketing email (CAN-SPAM).'},400);
  await db.prepare("INSERT INTO email_settings (id,from_name,from_email,reply_to,postal_address,updated) VALUES ('workspace',?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET from_name=excluded.from_name,from_email=excluded.from_email,reply_to=excluded.reply_to,postal_address=excluded.postal_address,updated=excluded.updated").bind(s.from_name,s.from_email,s.reply_to,s.postal_address,now).run();
  await audit(actor,'settings');return emailJson({ok:true});
 }
 if(d.action==='create'){const name=cleanName(d.name);if(!name)return emailJson({error:'Name the campaign.'},400);const id=crypto.randomUUID();
  await db.prepare("INSERT INTO email_campaigns (id,name,subject,html,text,state,revision,tested_revision,link_origin,created,updated,owner) VALUES (?,?,'','','','draft',1,0,'',?,?,?)").bind(id,name,now,now,actor).run();await audit(actor,'create',id);return emailJson({id})}
 if(d.action==='suppress'){const emails:string[]=Array.isArray(d.emails)?d.emails.slice(0,EMAIL_LIMITS.recipientsPerUpload).map(normalizeEmail).filter(validEmail):[];if(!emails.length)return emailJson({error:'Enter at least one valid email address.'},400);
  await db.batch(emails.map(e=>db.prepare("INSERT OR IGNORE INTO email_suppressions (email,reason,created) VALUES (?,'manual',?)").bind(e,now)));await audit(actor,'suppress','',String(emails.length));return emailJson({ok:true,added:emails.length})}
 if(!isId(d.campaign))return emailJson({error:'Choose a campaign.'},400);
 const c=await db.prepare('SELECT * FROM email_campaigns WHERE id=?').bind(d.campaign).first<Campaign>();if(!c)return emailJson({error:'Campaign not found.'},404);
 const draftOnly=()=>c.state!=='draft'?emailJson({error:'This campaign has started and can no longer be edited.'},409):null;
 const stale=()=>d.revision!==c.revision?emailJson({error:'This campaign changed in another window. Refresh and try again.'},409):null;
 if(d.action==='update'){const blocked=draftOnly()||stale();if(blocked)return blocked;
  const name=cleanName(d.name),subject=str(d.subject,EMAIL_LIMITS.subject),html=str(d.html,EMAIL_LIMITS.html),text=str(d.text??'',EMAIL_LIMITS.text);
  if(!name||subject===null||html===null||text===null)return emailJson({error:`Check the campaign fields (subject up to ${EMAIL_LIMITS.subject} characters).`},400);
  const r=await db.prepare("UPDATE email_campaigns SET name=?,subject=?,html=?,text=?,revision=revision+1,updated=? WHERE id=? AND revision=? AND state='draft'").bind(name,subject.replace(/[\r\n]+/g,' '),html,text,now,c.id,c.revision).run();
  if(!r.meta.changes)return emailJson({error:'This campaign changed. Refresh and try again.'},409);return emailJson({ok:true,revision:c.revision+1})}
 if(d.action==='recipients'){const blocked=draftOnly();if(blocked)return blocked;
  if(d.consent!==true)return emailJson({error:'Confirm that every recipient opted in to receive email from you.'},400);
  if(!Array.isArray(d.recipients)||d.recipients.length<1||d.recipients.length>EMAIL_LIMITS.recipientsPerUpload)return emailJson({error:`Send between 1 and ${EMAIL_LIMITS.recipientsPerUpload} recipients per request.`},400);
  const seen=new Set<string>(),rows:{email:string;name:string}[]=[];let invalid=0;
  for(const r of d.recipients){const email=normalizeEmail(r?.email);if(!validEmail(email)){invalid++;continue}if(seen.has(email))continue;seen.add(email);rows.push({email,name:cleanName(r?.name)})}
  const existing=await db.prepare('SELECT COUNT(*) total FROM email_recipients WHERE campaign=?').bind(c.id).first<{total:number}>();
  if((existing?.total||0)+rows.length>EMAIL_LIMITS.recipientsPerCampaign)return emailJson({error:`A campaign can hold up to ${EMAIL_LIMITS.recipientsPerCampaign.toLocaleString()} recipients.`},413);
  // D1 allows 100 bound parameters per statement: 24 rows x 4 values.
  const statements=[];for(let i=0;i<rows.length;i+=24){const part=rows.slice(i,i+24);statements.push(db.prepare(`INSERT OR IGNORE INTO email_recipients (campaign,email,name,updated) VALUES ${part.map(()=>'(?,?,?,?)').join(',')}`).bind(...part.flatMap(r=>[c.id,r.email,r.name,now])))}
  const added=statements.length?(await db.batch(statements)).reduce((n,r)=>n+(r.meta.changes||0),0):0;
  await audit(actor,'recipients',c.id,`added ${added}; opt-in consent confirmed`);
  return emailJson({ok:true,added,duplicates:rows.length-added,invalid})}
 if(d.action==='clearRecipients'){const blocked=draftOnly();if(blocked)return blocked;await db.prepare('DELETE FROM email_recipients WHERE campaign=?').bind(c.id).run();await audit(actor,'clearRecipients',c.id);return emailJson({ok:true})}
 if(d.action==='test'){const blocked=draftOnly()||stale();if(blocked)return blocked;
  const settings=await loadSettings();if(!settingsComplete(settings))return emailJson({error:'Complete the sender settings first.'},409);
  const ready=readiness();if(!ready.provider||!ready.links)return emailJson({error:'RESEND_API_KEY and EMAIL_LINK_SECRET must be set as Worker secrets on this deployment.'},503);
  if(!c.subject.trim()||!c.html.trim())return emailJson({error:'Add a subject and message body first.'},409);
  const to=normalizeEmail(a.member.email);if(!validEmail(to))return emailJson({error:'Your account has no email address for a test send.'},409);
  const r=await testSend(c,settings,to,new URL(req.url).origin);
  if(!r.ok){await audit(actor,'testFailed',c.id,r.error);return emailJson({error:'Test email was not accepted: '+r.error},502)}
  await db.prepare('UPDATE email_campaigns SET tested_revision=? WHERE id=? AND revision=?').bind(c.revision,c.id,c.revision).run();await audit(actor,'test',c.id,to);
  return emailJson({ok:true,to})}
 if(d.action==='approve'){const blocked=draftOnly()||stale();if(blocked)return blocked;
  if(c.tested_revision!==c.revision)return emailJson({error:'Send yourself a test of this exact version before sending.'},409);
  const settings=await loadSettings(),ready=readiness();if(!settingsComplete(settings)||!ready.provider||!ready.links)return emailJson({error:'Sender settings or provider secrets are incomplete.'},409);
  await db.prepare("UPDATE email_recipients SET status='suppressed' WHERE campaign=? AND status='queued' AND email IN (SELECT email FROM email_suppressions)").bind(c.id).run();
  const total=(await counts(c.id)).queued||0;if(!total)return emailJson({error:'Add recipients first.'},409);
  if(d.confirmCount!==total)return emailJson({error:`Type the exact number of recipients (${total.toLocaleString()}) to confirm.`},400);
  const r=await db.prepare("UPDATE email_campaigns SET state='sending',link_origin=?,updated=? WHERE id=? AND revision=? AND state='draft' AND tested_revision=revision").bind(new URL(req.url).origin,now,c.id,c.revision).run();
  if(!r.meta.changes)return emailJson({error:'This campaign changed. Refresh and try again.'},409);
  await audit(actor,'approve',c.id,`${total} recipients`);return emailJson({ok:true,state:'sending'})}
 if(d.action==='dispatch'){const out=await dispatch(c.id);if('error' in out&&out.error)return emailJson({error:out.error},out.status||500);return emailJson(out)}
 if(d.action==='pause'||d.action==='resume'){const [from,to]=d.action==='pause'?['sending','paused']:['paused','sending'];
  const r=await db.prepare('UPDATE email_campaigns SET state=?,updated=? WHERE id=? AND state=?').bind(to,now,c.id,from).run();if(!r.meta.changes)return emailJson({error:'Campaign state changed. Refresh and try again.'},409);await audit(actor,d.action,c.id);return emailJson({ok:true,state:to})}
 if(d.action==='cancel'){if(!['draft','sending','paused'].includes(c.state))return emailJson({error:'This campaign has already finished.'},409);
  await db.batch([db.prepare("UPDATE email_campaigns SET state='cancelled',updated=? WHERE id=? AND state IN ('draft','sending','paused')").bind(now,c.id),db.prepare("UPDATE email_recipients SET status='cancelled',updated=? WHERE campaign=? AND status='queued'").bind(now,c.id)]);
  await audit(actor,'cancel',c.id);return emailJson({ok:true,state:'cancelled'})}
 return emailJson({error:'Unknown action.'},400);
 }catch(e){console.error(e);return emailJson({error:'Email campaign could not be updated. Refresh and try again.'},503)}
}
