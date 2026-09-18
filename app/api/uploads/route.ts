import {workspaceAccess} from '@/lib/access';
import {database,bucket} from '@/lib/storage';
import {MAX_FILE_BYTES,UPLOAD_CHUNK_BYTES,type UploadSession} from '@/lib/transfers';
function validId(s:unknown):s is string{return typeof s==='string'&&/^[a-zA-Z0-9-]{12,80}$/.test(s)}
export async function POST(req:Request){
 try{const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
 const auth=await workspaceAccess('uploadFiles');if(auth.response)return auth.response;
 const d=await req.json() as {id:unknown;batch:unknown;channel:unknown;name:unknown;size:unknown;type:unknown};
 if(!d||!validId(d.id)||!validId(d.batch)||typeof d.channel!=='string'||typeof d.name!=='string'||!d.name.trim()||d.name.length>240||typeof d.size!=='number'||!Number.isSafeInteger(d.size)||d.size<0||d.size>MAX_FILE_BYTES)return Response.json({error:'Invalid file. Files may be up to 78.1 GiB each.'},{status:400});
 const db=database();const existing=await db.prepare('SELECT * FROM upload_sessions WHERE id=?').bind(d.id).first<UploadSession>();
 if(existing){if(existing.owner!==auth.user!.userId||existing.batch!==d.batch||existing.channel!==d.channel||existing.size!==d.size||existing.name!==d.name)return Response.json({error:'Upload ID is already in use.'},{status:409});return Response.json({id:existing.id,state:existing.state,chunkSize:UPLOAD_CHUNK_BYTES});}
 if(!await db.prepare('SELECT id FROM channels WHERE id=?').bind(d.channel).first())return Response.json({error:'Channel not found.'},{status:404});
 if(await db.prepare('SELECT id FROM files WHERE id=?').bind(d.id).first())return Response.json({error:'This file has already been shared.'},{status:409});
 const upload=d.size?await bucket().createMultipartUpload(d.id,{httpMetadata:{contentType:'application/octet-stream'}}):null;
 try{if(!d.size)await bucket().put(d.id,new Uint8Array());
 await db.prepare('INSERT INTO upload_sessions (id,owner,batch,channel,name,size,type,upload_id,state,created) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(d.id,auth.user!.userId,d.batch,d.channel,d.name,d.size,typeof d.type==='string'?d.type.slice(0,120):'application/octet-stream',upload?.uploadId||'',d.size?'uploading':'complete',Date.now()).run();
 }catch(e){if(upload)await upload.abort();else if(!await db.prepare('SELECT id FROM upload_sessions WHERE id=?').bind(d.id).first())await bucket().delete(d.id);throw e;}
 return Response.json({id:d.id,state:d.size?'uploading':'complete',chunkSize:UPLOAD_CHUNK_BYTES});
 }catch(e){console.error(e);return Response.json({error:'Could not start this upload. Please try again.'},{status:503});}
}
export async function DELETE(req:Request){
 try{const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Invalid request origin.'},{status:403});
 const auth=await workspaceAccess();if(auth.response)return auth.response;const batch=new URL(req.url).searchParams.get('batch');if(!validId(batch))return Response.json({error:'Invalid upload batch.'},{status:400});
 const db=database();const rows=await db.prepare('SELECT * FROM upload_sessions WHERE owner=? AND batch=?').bind(auth.user!.userId,batch).all<UploadSession>();
 for(const row of rows.results){if(await db.prepare('SELECT id FROM files WHERE id=?').bind(row.id).first())continue;if(row.state==='uploading'&&row.upload_id){try{await bucket().resumeMultipartUpload(row.id,row.upload_id).abort()}catch{}}await bucket().delete(row.id);await db.prepare('DELETE FROM upload_sessions WHERE id=? AND owner=?').bind(row.id,auth.user!.userId).run();}
 return Response.json({ok:true});
 }catch(e){console.error(e);return Response.json({error:'Could not clear unfinished uploads.'},{status:503});}
}
