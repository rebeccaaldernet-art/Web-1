import {lakeOwner,lakeJson,audit,validateData,validSheetName,isId,readSheet,hashToken,deleteWorkbookObjects,LAKE_LIMITS,type Workbook,type Sheet} from '@/lib/data-lake';
import {database,bucket} from '@/lib/storage';
const STAGING_TTL=2*3600000;
export async function GET(req:Request){const a=await lakeOwner();if(a.response)return a.response;try{const db=database(),sheet=new URL(req.url).searchParams.get('sheet');
 if(sheet){const d=await readSheet(sheet);if(!d)return lakeJson({error:'Worksheet not found.'},404);const workbook=await db.prepare('SELECT id,name,revision,sheet_count,updated FROM lake_workbooks WHERE id=?').bind(d.sheet.workbook).first<Workbook>();await audit(a.member.id,'read',sheet);return lakeJson({sheet:{id:d.sheet.id,workbook:d.sheet.workbook,position:d.sheet.position,name:d.sheet.name,row_count:d.sheet.row_count,updated:d.sheet.updated},workbook,data:d.data})}
 const workbooks=(await db.prepare("SELECT id,name,revision,sheet_count,bytes,created,updated FROM lake_workbooks WHERE state='complete' ORDER BY created DESC").all<Workbook>()).results;
 const sheets=(await db.prepare("SELECT s.id,s.workbook,s.position,s.name,s.row_count,s.updated FROM lake_sheets s JOIN lake_workbooks w ON w.id=s.workbook WHERE w.state='complete' ORDER BY s.position").all<Sheet>()).results;
 return lakeJson({workbooks:workbooks.map(w=>({...w,sheets:sheets.filter(s=>s.workbook===w.id)})),tokens:(await db.prepare('SELECT id,dataset,expires,created FROM lake_tokens ORDER BY created DESC').all()).results,audit:(await db.prepare('SELECT actor,action,dataset,created FROM lake_audit ORDER BY created DESC LIMIT 100').all()).results,limits:LAKE_LIMITS})}catch{return lakeJson({error:'Data Lake is temporarily unavailable.'},503)}}
async function staging(id:unknown,owner:string){if(!isId(id))return null;const w=await database().prepare("SELECT * FROM lake_workbooks WHERE id=? AND state='staging' AND owner=?").bind(id,owner).first<Workbook>();return w}
async function removeWorkbook(id:string,actor:string,action:string){const db=database();await db.batch([
 db.prepare('DELETE FROM lake_tokens WHERE dataset=? OR dataset IN (SELECT id FROM lake_sheets WHERE workbook=?)').bind(id,id),
 db.prepare('DELETE FROM lake_sheets WHERE workbook=?').bind(id),
 db.prepare('DELETE FROM lake_workbooks WHERE id=?').bind(id),
 db.prepare('DELETE FROM lake_datasets WHERE id=?').bind(id),
 db.prepare('INSERT INTO lake_audit (id,actor,action,dataset,created) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,id,Date.now())
]);await deleteWorkbookObjects(id)}
export async function POST(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)return lakeJson({error:'Invalid origin.'},403);const a=await lakeOwner();if(a.response)return a.response;try{const reader=req.body?.getReader();if(!reader)return lakeJson({error:'Missing data.'},400);let size=0;const chunks:Uint8Array[]=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){await reader.cancel();return lakeJson({error:'Each request may carry at most 8 MB of extracted data. Import sheets one request at a time.'},413)}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}let d:any;try{d=JSON.parse(new TextDecoder().decode(bytes))}catch{return lakeJson({error:'Invalid data.'},400)}const db=database(),now=Date.now();
 // Import runs in stages: begin → one request per worksheet → commit. Nothing is listed until commit succeeds.
 if(d.action==='import-begin'){if(!validSheetName(d.name)||!Number.isInteger(d.sheetCount)||d.sheetCount<1||d.sheetCount>LAKE_LIMITS.workbookSheets)return lakeJson({error:'Give the workbook a name and between 1 and '+LAKE_LIMITS.workbookSheets+' worksheets.'},400);
  const stale=(await db.prepare("SELECT id FROM lake_workbooks WHERE state='staging' AND created<? LIMIT 10").bind(now-STAGING_TTL).all<{id:string}>()).results;for(const s of stale){try{await removeWorkbook(s.id,a.member.id,'discard-stale-import')}catch{}}
  const id=crypto.randomUUID();await db.prepare("INSERT INTO lake_workbooks (id,name,state,revision,sheet_count,bytes,created,updated,owner) VALUES (?,?,'staging',?,?,0,?,?,?)").bind(id,d.name.trim(),'staging-'+id,d.sheetCount,now,now,a.member.id).run();await audit(a.member.id,'import-begin',id);return lakeJson({id})}
 if(d.action==='import-sheet'){const w=await staging(d.workbook,a.member.id);if(!w)return lakeJson({error:'This import is no longer open. Start the upload again.'},404);
  if(!Number.isInteger(d.position)||d.position<0||d.position>=w.sheet_count||!validSheetName(d.name))return lakeJson({error:'Invalid worksheet position or name.'},400);
  if(!validateData(d.data))return lakeJson({error:'Worksheet "'+String(d.name).slice(0,80)+'" needs unique column names, at most '+LAKE_LIMITS.sheetColumns+' columns and '+LAKE_LIMITS.sheetRows.toLocaleString()+' rows.'},400);
  const body=JSON.stringify(d.data),sheetBytes=new TextEncoder().encode(body).length;if(sheetBytes>LAKE_LIMITS.sheetJsonBytes)return lakeJson({error:'Worksheet "'+d.name+'" exceeds 7 MB of extracted data.'},413);
  if(w.bytes+sheetBytes>LAKE_LIMITS.workbookJsonBytes)return lakeJson({error:'Workbook budget is 64 MB of extracted data across all worksheets.'},413);
  if(await db.prepare('SELECT id FROM lake_sheets WHERE workbook=? AND position=?').bind(w.id,d.position).first())return lakeJson({error:'Worksheet position '+(d.position+1)+' was already received.'},409);
  const id=crypto.randomUUID(),objectKey='data-lake/'+w.id+'/'+id+'/'+crypto.randomUUID();await bucket().put(objectKey,body);
  try{await db.batch([db.prepare('INSERT INTO lake_sheets (id,workbook,position,name,columns,row_count,bytes,object_key,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,w.id,d.position,d.name.trim(),JSON.stringify(d.data.columns),d.data.rows.length,sheetBytes,objectKey,now,now),db.prepare('UPDATE lake_workbooks SET bytes=bytes+?,updated=? WHERE id=?').bind(sheetBytes,now,w.id)])}catch(e){await bucket().delete(objectKey);throw e}
  return lakeJson({id})}
 if(d.action==='import-commit'){const w=await staging(d.workbook,a.member.id);if(!w)return lakeJson({error:'This import is no longer open. Start the upload again.'},404);
  const positions=(await db.prepare('SELECT position FROM lake_sheets WHERE workbook=? ORDER BY position').bind(w.id).all<{position:number}>()).results.map(r=>r.position);
  const complete=positions.length===w.sheet_count&&positions.every((p,i)=>p===i);
  if(!complete)return lakeJson({error:'Received '+positions.length+' of '+w.sheet_count+' worksheets. The workbook was not saved; retry the upload.',incomplete:true},409);
  const revision=crypto.randomUUID();const change=await db.prepare("UPDATE lake_workbooks SET state='complete',revision=?,updated=? WHERE id=? AND state='staging'").bind(revision,now,w.id).run();if(!change.meta.changes)return lakeJson({error:'This import is no longer open.'},409);
  await audit(a.member.id,'upload',w.id);return lakeJson({id:w.id,revision})}
 if(d.action==='import-abort'){const w=await staging(d.workbook,a.member.id);if(w)await removeWorkbook(w.id,a.member.id,'discard-import');return lakeJson({ok:true})}
 if(d.action==='update'){
  if(!isId(d.id)||!isId(d.sheet)||typeof d.revision!=='string'||!validateData(d.data))return lakeJson({error:'Invalid worksheet changes.'},400);
  const body=JSON.stringify(d.data),sheetBytes=new TextEncoder().encode(body).length;if(sheetBytes>LAKE_LIMITS.sheetJsonBytes)return lakeJson({error:'This worksheet exceeds 7 MB of extracted data.'},413);
  const current=await db.prepare("SELECT w.revision,w.bytes,s.bytes AS sheet_bytes FROM lake_workbooks w JOIN lake_sheets s ON s.workbook=w.id WHERE w.id=? AND s.id=? AND w.state='complete'").bind(d.id,d.sheet).first<{revision:string;bytes:number;sheet_bytes:number}>();
  if(!current)return lakeJson({error:'Workbook not found.'},404);if(current.revision!==d.revision)return lakeJson({error:'This workbook changed in another session. Download your edits before reloading the latest version.'},409);
  if(current.bytes-current.sheet_bytes+sheetBytes>LAKE_LIMITS.workbookJsonBytes)return lakeJson({error:'Workbook budget is 64 MB of extracted data across all worksheets.'},413);
  const objectKey='data-lake/'+d.id+'/'+d.sheet+'/'+crypto.randomUUID(),revision=crypto.randomUUID();await bucket().put(objectKey,body);
  // Both statements are guarded by the caller's revision, so a save that lost the race changes nothing.
  const result=await db.batch([
   db.prepare('UPDATE lake_sheets SET object_key=?,columns=?,row_count=?,bytes=?,updated=? WHERE id=? AND workbook=? AND (SELECT revision FROM lake_workbooks WHERE id=?)=?').bind(objectKey,JSON.stringify(d.data.columns),d.data.rows.length,sheetBytes,now,d.sheet,d.id,d.id,d.revision),
   db.prepare('UPDATE lake_workbooks SET revision=?,bytes=bytes-?+?,updated=? WHERE id=? AND revision=?').bind(revision,current.sheet_bytes,sheetBytes,now,d.id,d.revision)
  ]);
  if(!result[1].meta.changes){await bucket().delete(objectKey);return lakeJson({error:'Another session saved first. Download your edits before reloading.'},409)}
  await audit(a.member.id,'update',d.sheet);return lakeJson({ok:true,revision});
 }
 if(d.action==='delete'){
  if(!isId(d.id))return lakeJson({error:'Invalid workbook.'},400);
  try{await removeWorkbook(d.id,a.member.id,'delete-workbook')}catch{return lakeJson({error:'Workbook access was removed, but file cleanup could not finish. Click Reset workbook again to retry deletion.'},503)}
  return lakeJson({ok:true});
 }
 if(d.action==='token'){if(!isId(d.sheet)||!await db.prepare("SELECT s.id FROM lake_sheets s JOIN lake_workbooks w ON w.id=s.workbook WHERE s.id=? AND w.state='complete'").bind(d.sheet).first())return lakeJson({error:'Worksheet not found.'},404);const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join(''),id=crypto.randomUUID(),expires=now+30*86400000;await db.prepare('INSERT INTO lake_tokens (id,dataset,hash,owner,expires,created) VALUES (?,?,?,?,?,?)').bind(id,d.sheet,await hashToken(token),a.member.id,expires,now).run();await audit(a.member.id,'create-read-token',d.sheet);return lakeJson({token,id,expires})}
 if(d.action==='revoke'&&typeof d.id==='string'){await db.prepare('DELETE FROM lake_tokens WHERE id=?').bind(d.id).run();await audit(a.member.id,'revoke-token',d.id);return lakeJson({ok:true})}
 return lakeJson({error:'Unknown action.'},400);
 }catch{return lakeJson({error:'The operation could not be completed. Please try again.'},503)}}
