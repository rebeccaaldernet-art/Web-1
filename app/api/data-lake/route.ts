import {lakeOwner,lakeJson,audit,validateData,readData,hashToken} from '@/lib/data-lake';
import {database,bucket} from '@/lib/storage';
export async function GET(req:Request){const a=await lakeOwner();if(a.response)return a.response;try{const id=new URL(req.url).searchParams.get('id');if(id){const d=await readData(id);if(!d)return lakeJson({error:'Dataset not found.'},404);await audit(a.member.id,'read',id);return lakeJson(d)}const db=database();return lakeJson({datasets:(await db.prepare('SELECT id,name,row_count,columns,created FROM lake_datasets ORDER BY created DESC').all()).results,tokens:(await db.prepare('SELECT id,dataset,expires,created FROM lake_tokens ORDER BY created DESC').all()).results,audit:(await db.prepare('SELECT actor,action,dataset,created FROM lake_audit ORDER BY created DESC LIMIT 100').all()).results})}catch{return lakeJson({error:'Data Lake is temporarily unavailable.'},503)}}
export async function POST(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)return lakeJson({error:'Invalid origin.'},403);const a=await lakeOwner();if(a.response)return a.response;try{const reader=req.body?.getReader();if(!reader)return lakeJson({error:'Missing data.'},400);let size=0;const chunks:Uint8Array[]=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){await reader.cancel();return lakeJson({error:'Import limit is 8 MB of extracted data.'},413)}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}let d:any;try{d=JSON.parse(new TextDecoder().decode(bytes))}catch{return lakeJson({error:'Invalid data.'},400)}const db=database();
 if(d.action==='upload'){if(typeof d.name!=='string'||!d.name.trim()||d.name.length>160||!validateData(d.data))return lakeJson({error:'Use unique column names, at most 100 columns and 50,000 rows.'},400);const id=crypto.randomUUID(),objectKey='data-lake/'+id;await bucket().put(objectKey,JSON.stringify(d.data));try{await db.prepare('INSERT INTO lake_datasets (id,name,columns,row_count,object_key,created,owner) VALUES (?,?,?,?,?,?,?)').bind(id,d.name,JSON.stringify(d.data.columns),d.data.rows.length,objectKey,Date.now(),a.member.id).run()}catch(e){await bucket().delete(objectKey);throw e}await audit(a.member.id,'upload',id);return lakeJson({id})}
 if(d.action==='update'){
  if(typeof d.id!=='string'||typeof d.revision!=='string'||!validateData(d.data))return lakeJson({error:'Invalid dataset changes.'},400);
  const current=await db.prepare('SELECT object_key FROM lake_datasets WHERE id=?').bind(d.id).first<{object_key:string}>();if(!current)return lakeJson({error:'Dataset not found.'},404);if(current.object_key!==d.revision)return lakeJson({error:'This dataset changed in another session. Download your edits before reloading the latest version.'},409);
  const objectKey='data-lake/'+d.id+'/'+crypto.randomUUID();await bucket().put(objectKey,JSON.stringify(d.data));
  const change=await db.prepare('UPDATE lake_datasets SET object_key=?,columns=?,row_count=? WHERE id=? AND object_key=?').bind(objectKey,JSON.stringify(d.data.columns),d.data.rows.length,d.id,d.revision).run();
  if(!change.meta.changes){await bucket().delete(objectKey);return lakeJson({error:'Another session saved first. Download your edits before reloading.'},409)}
  await audit(a.member.id,'update',d.id);return lakeJson({ok:true,revision:objectKey});
 }
 if(d.action==='delete'){
  if(typeof d.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(d.id))return lakeJson({error:'Invalid workbook.'},400);
  await db.batch([
   db.prepare('DELETE FROM lake_tokens WHERE dataset=?').bind(d.id),
   db.prepare('DELETE FROM lake_datasets WHERE id=?').bind(d.id),
   db.prepare('INSERT INTO lake_audit (id,actor,action,dataset,created) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),a.member.id,'delete-workbook',d.id,Date.now())
  ]);
  try{const store=bucket();await store.delete('data-lake/'+d.id);let cursor:string|undefined;
   do{const page=await store.list({prefix:'data-lake/'+d.id+'/',limit:500,...(cursor?{cursor}:{})});if(page.objects.length)await store.delete(page.objects.map(o=>o.key));cursor=page.truncated?page.cursor:undefined;}while(cursor);
  }catch{return lakeJson({error:'Workbook access was removed, but file cleanup could not finish. Click Reset workbook again to retry deletion.'},503)}
  return lakeJson({ok:true});
 }
 if(d.action==='token'){if(typeof d.id!=='string'||!await db.prepare('SELECT id FROM lake_datasets WHERE id=?').bind(d.id).first())return lakeJson({error:'Dataset not found.'},404);const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join(''),id=crypto.randomUUID(),expires=Date.now()+30*86400000;await db.prepare('INSERT INTO lake_tokens (id,dataset,hash,owner,expires,created) SELECT ?,id,?,?,?,? FROM lake_datasets WHERE id=?').bind(id,await hashToken(token),a.member.id,expires,Date.now(),d.id).run();await audit(a.member.id,'create-read-token',d.id);return lakeJson({token,id,expires})}
 if(d.action==='revoke'&&typeof d.id==='string'){await db.prepare('DELETE FROM lake_tokens WHERE id=?').bind(d.id).run();await audit(a.member.id,'revoke-token',d.id);return lakeJson({ok:true})}
 return lakeJson({error:'Unknown action.'},400);
 }catch{return lakeJson({error:'The operation could not be completed. Please try again.'},503)}}
