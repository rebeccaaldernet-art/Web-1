import {parseMentions} from '@/lib/mentions';
import {effectivePermissions} from '@/lib/permissions';
import {workspaceAccess} from '@/lib/access';
import {database,bucket,initChannels} from '@/lib/storage';
export async function GET(req:Request){
 try{const auth=await workspaceAccess();if(auth.response)return auth.response;const user=auth.user!;const rights=effectivePermissions(auth.member!);const db=database();const channel=new URL(req.url).searchParams.get('channel')||'general';
 const cursor=await db.prepare('SELECT COALESCE(MAX(seq),0) AS seq FROM message_notifications WHERE channel=?').bind(channel).first<{seq:number}>();
 if(new URL(req.url).searchParams.get('check')==='1')return Response.json({seq:rights.readMessages?(cursor?.seq||0):0},{headers:{'Cache-Control':'private, no-store'}});
 await initChannels();
 const [channels,messages,files,pinnedMessages]=await Promise.all([db.prepare('SELECT * FROM channels ORDER BY created,name').all(),db.prepare('SELECT * FROM (SELECT * FROM messages WHERE channel=? ORDER BY created DESC LIMIT 200) ORDER BY created ASC').bind(channel).all(),db.prepare('SELECT * FROM files WHERE channel=? ORDER BY created DESC').bind(channel).all(),db.prepare('SELECT * FROM messages WHERE channel=? AND pinned=1 ORDER BY created DESC').bind(channel).all()]);
 return Response.json({pinnedMessages:rights.readMessages?pinnedMessages.results:[],channels:channels.results,messages:rights.readMessages?messages.results:[],files:rights.viewFiles?files.results:[],isOwner:auth.member.role==='owner',permissions:rights,readThrough:rights.readMessages?(cursor?.seq||0):0,user:{name:user.displayName,id:user.userId}},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return Response.json({error:'The workspace could not load. Please try again.'},{status:503});}
}
export async function POST(req:Request){
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
 const uploaded:string[]=[];
 try{const auth=await workspaceAccess();if(auth.response)return auth.response;const user=auth.user!;const rights=effectivePermissions(auth.member!);const db=database();
 if(req.headers.get('content-type')?.includes('application/json')){if(!rights.createChannels)return Response.json({error:'You do not have permission to create channels.'},{status:403});const data=await req.json() as {name?:unknown;description?:unknown};const name=String(data.name||'').trim().toLowerCase().replace(/\s+/g,'-');if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(name))return Response.json({error:'Use a channel name of 1–40 letters, numbers, or hyphens.'},{status:400});const id=crypto.randomUUID();await db.prepare('INSERT INTO channels (id,name,description,created) VALUES (?,?,?,?)').bind(id,name,String(data.description||'A space for your team to work together.').slice(0,300),Date.now()).run();return Response.json({id});}
 if(!rights.sendMessages)return Response.json({error:'You do not have permission to send messages.'},{status:403});
 const form=await req.formData();const channel=String(form.get('channel')||'general');const body=String(form.get('body')||'').trim();const attachments=form.getAll('files').filter((v):v is File=>typeof v!=='string');const uploadBatch=String(form.get('uploadBatch')||'');const requestId=String(form.get('requestId')||'');
 if(requestId){if(!/^[a-zA-Z0-9-]{12,80}$/.test(requestId))return Response.json({error:'Invalid message ID.'},{status:400});const prior=await db.prepare('SELECT id,user_id FROM messages WHERE id=?').bind(requestId).first<{id:string;user_id:string}>();if(prior)return prior.user_id===user.userId?Response.json({id:prior.id}):Response.json({error:'Message ID is in use.'},{status:409});}
 let stagedCount=0;if(uploadBatch){if(!rights.uploadFiles)return Response.json({error:'You do not have permission to upload files.'},{status:403});const staged=await db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN state='complete' THEN 1 ELSE 0 END),0) AS ready FROM upload_sessions WHERE owner=? AND batch=? AND channel=?").bind(user.userId,uploadBatch,channel).first<{total:number;ready:number}>();stagedCount=staged?.total||0;if(!stagedCount||stagedCount!==staged?.ready||stagedCount!==Number(form.get('fileCount')))return Response.json({error:'Some files have not finished uploading.'},{status:409});}
 if(attachments.length&&!rights.uploadFiles)return Response.json({error:'You do not have permission to upload files.'},{status:403});
 if((!body&&!attachments.length&&!stagedCount)||body.length>10000||attachments.reduce((s,f)=>s+f.size,0)>25*1024*1024)return Response.json({error:'Add a message or files. For large transfers, refresh and use the chunked uploader. Messages may contain 10,000 characters.'},{status:400});
 if(!await db.prepare('SELECT id FROM channels WHERE id=?').bind(channel).first())return Response.json({error:'Channel not found.'},{status:404});
 let reply:string|null=null;const replyTo=String(form.get('replyTo')||'');
 if(replyTo){
  const original=await db.prepare('SELECT id,author,body FROM messages WHERE id=? AND channel=?').bind(replyTo,channel).first<{id:string;author:string;body:string}>();
  if(!original)return Response.json({error:'The message you are replying to is no longer available in this channel.'},{status:409});
  const text=original.body||'Attachment';const quote=String(form.get('replyQuote')||text.slice(0,1000));
  if(quote.length>1000||!text.includes(quote))return Response.json({error:'The quoted text changed. Select the message again to reply.'},{status:409});
  reply=JSON.stringify({id:original.id,author:original.author,quote});
 }
 const id=requestId||crypto.randomUUID(), now=Date.now();const mentions=JSON.stringify(await parseMentions(body));const statements=[db.prepare('INSERT INTO messages (id,channel,author,user_id,body,created,mentions,reply) VALUES (?,?,?,?,?,?,?,?)').bind(id,channel,user.displayName,user.userId,body,now,mentions,reply)];
 for(const f of attachments){const fid=crypto.randomUUID();await bucket().put(fid,f.stream(),{httpMetadata:{contentType:'application/octet-stream'}});uploaded.push(fid);statements.push(db.prepare('INSERT INTO files (id,message_id,channel,name,size,type,author,created) VALUES (?,?,?,?,?,?,?,?)').bind(fid,id,channel,f.name.slice(0,240),f.size,f.type||'application/octet-stream',user.displayName,now));}
 if(uploadBatch){statements.push(db.prepare("INSERT INTO files (id,message_id,channel,name,size,type,author,created) SELECT id,?,channel,name,size,type,?,? FROM upload_sessions WHERE owner=? AND batch=? AND channel=? AND state='complete'").bind(id,user.displayName,now,user.userId,uploadBatch,channel));statements.push(db.prepare('DELETE FROM upload_sessions WHERE owner=? AND batch=? AND channel=?').bind(user.userId,uploadBatch,channel));}
 statements.push(db.prepare('INSERT INTO message_notifications (message_id,channel,sender) VALUES (?,?,?)').bind(id,channel,user.userId));
 await db.batch(statements);return Response.json({id});
 }catch(e){for(const id of uploaded){try{await bucket().delete(id)}catch{}}console.error(e);return Response.json({error:String(e).includes('UNIQUE')?'A channel with that name already exists.':'Could not save. Your message is still here; please try again.'},{status:503});}
}
