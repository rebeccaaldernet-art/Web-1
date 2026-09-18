import {workspaceAccess} from '@/lib/access';
import {database,bucket} from '@/lib/storage';
import {UPLOAD_CHUNK_BYTES,type UploadSession} from '@/lib/transfers';
async function authorize(req:Request,params:Promise<{id:string}>){
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return {response:Response.json({error:'Invalid request origin.'},{status:403})};
 const auth=await workspaceAccess('uploadFiles');if(auth.response)return {response:auth.response};
 const {id}=await params;const upload=await database().prepare('SELECT * FROM upload_sessions WHERE id=? AND owner=?').bind(id,auth.user!.userId).first<UploadSession>();
 if(!upload)return {response:Response.json({error:'Upload not found.'},{status:404})};return {upload};
}
export async function PUT(req:Request,{params}:{params:Promise<{id:string}>}){
 try{const auth=await authorize(req,params);if(auth.response)return auth.response;const u=auth.upload!;
 if(u.state!=='uploading')return Response.json({error:'Upload is already complete.'},{status:409});
 const part=Number(new URL(req.url).searchParams.get('part'));const expected=Math.min(UPLOAD_CHUNK_BYTES,u.size-(part-1)*UPLOAD_CHUNK_BYTES);
 if(!Number.isInteger(part)||part<1||part>Math.ceil(u.size/UPLOAD_CHUNK_BYTES)||expected<=0)return Response.json({error:'Invalid part number.'},{status:400});
 if(Number(req.headers.get('content-length'))!==expected)return Response.json({error:'Unexpected upload part size.'},{status:400});
 // Buffer only one bounded part, never the whole file.
 const bytes=await req.arrayBuffer();if(bytes.byteLength!==expected)return Response.json({error:'Upload part was incomplete.'},{status:400});
 const result=await bucket().resumeMultipartUpload(u.id,u.upload_id).uploadPart(part,bytes);return Response.json(result);
 }catch(e){console.error(e);return Response.json({error:'This upload part failed. Please retry.'},{status:503});}
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{const auth=await authorize(req,params);if(auth.response)return auth.response;const u=auth.upload!;if(u.state==='complete')return Response.json({id:u.id});
 const d=await req.json() as {parts?:{partNumber:number;etag:string}[]};
 if(!d||!Array.isArray(d.parts)||d.parts.length!==Math.ceil(u.size/UPLOAD_CHUNK_BYTES)||d.parts.some((p,i)=>!p||p.partNumber!==i+1||typeof p.etag!=='string'||p.etag.length>200))return Response.json({error:'Upload parts are incomplete.'},{status:400});
 // A previous completion may have succeeded even if its response was lost.
 const existing=await bucket().head(u.id);const object=existing||await bucket().resumeMultipartUpload(u.id,u.upload_id).complete(d.parts);
 if(object.size!==u.size)return Response.json({error:'Uploaded file size does not match.'},{status:409});
 await database().prepare("UPDATE upload_sessions SET state='complete' WHERE id=? AND owner=?").bind(u.id,u.owner).run();return Response.json({id:u.id});
 }catch(e){console.error(e);return Response.json({error:'Could not finish this upload. Please retry.'},{status:503});}
}
