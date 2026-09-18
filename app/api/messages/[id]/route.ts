import {parseMentions} from '@/lib/mentions';
import {workspaceAccess} from '@/lib/access';
import { database, bucket } from '@/lib/storage';

async function authorize(req: Request, params: Promise<{id:string}>) {
  const auth=await workspaceAccess(req.method==='DELETE'?'deleteOwnMessages':'editOwnMessages');if(auth.response)return {response:auth.response};const user=auth.user!;
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return { response: Response.json({error:'Invalid request origin.'},{status:403}) };
  const {id} = await params;
  const message = await database().prepare('SELECT id, user_id FROM messages WHERE id=?').bind(id).first<{id:string;user_id:string}>();
  if (!message) return { response: Response.json({error:'This message has already been deleted.'},{status:404}) };
  if (message.user_id !== user.userId) return { response: Response.json({error:'You can only change your own messages.'},{status:403}) };
  return {id, user};
}

export async function PATCH(req: Request, {params}: {params:Promise<{id:string}>}) {
  try {
    const auth = await authorize(req, params);
    if (auth.response) return auth.response;
    let data: unknown;
    try { data = await req.json(); } catch { return Response.json({error:'Enter valid message text.'},{status:400}); }
    const body = data && typeof data === 'object' && 'body' in data && typeof data.body === 'string' ? data.body.trim() : null;
    if (body === null || body.length > 10000) return Response.json({error:'Messages must contain no more than 10,000 characters.'},{status:400});
    const db = database();
    if (!body && !await db.prepare('SELECT id FROM files WHERE message_id=? LIMIT 1').bind(auth.id).first()) return Response.json({error:'Enter a message, or use Delete to remove it.'},{status:400});
    const result = await db.prepare('UPDATE messages SET body=?, edited=?,mentions=? WHERE id=? AND user_id=?').bind(body, Date.now(), JSON.stringify(await parseMentions(body)),auth.id, auth.user!.userId).run();
    if (!result.meta.changes) return Response.json({error:'This message has already been deleted.'},{status:404});
    return Response.json({id:auth.id});
  } catch (e) {
    console.error(e);
    return Response.json({error:'Could not save your changes. Please try again.'},{status:503});
  }
}

export async function DELETE(req: Request, {params}: {params:Promise<{id:string}>}) {
  try {
    const auth = await authorize(req, params);
    if (auth.response) return auth.response;
    const db = database();
    const files = await db.prepare('SELECT id FROM files WHERE message_id=?').bind(auth.id).all<{id:string}>();
    await db.batch([
      db.prepare('DELETE FROM files WHERE message_id=? AND EXISTS (SELECT 1 FROM messages WHERE id=? AND user_id=?)').bind(auth.id,auth.id,auth.user!.userId),
      db.prepare('DELETE FROM messages WHERE id=? AND user_id=?').bind(auth.id,auth.user!.userId),
    ]);
    // Revoke download access atomically with the message, then remove its stored bytes.
    const cleanup = await Promise.allSettled(files.results.map(f=>bucket().delete(f.id)));
    cleanup.forEach(result=>{if(result.status==='rejected')console.error('Attachment cleanup failed',result.reason)});
    return Response.json({id:auth.id});
  } catch (e) {
    console.error(e);
    return Response.json({error:'Could not delete this message. Please try again.'},{status:503});
  }
}

export async function PUT(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const auth=await workspaceAccess('sendMessages');if(auth.response)return auth.response;
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
  let data:{pinned?:unknown};try{data=await req.json() as typeof data}catch{return Response.json({error:'Invalid pin request.'},{status:400})}
  if(!data||typeof data.pinned!=='boolean')return Response.json({error:'Choose pin or unpin.'},{status:400});
  const {id}=await params;
  const result=await database().prepare('UPDATE messages SET pinned=? WHERE id=?').bind(data.pinned?1:0,id).run();
  if(!result.meta.changes)return Response.json({error:'This message has been deleted.'},{status:404});
  return Response.json({id,pinned:data.pinned},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return Response.json({error:'Could not update the pin. Please try again.'},{status:503})}
}
