import {workspaceAccess} from '@/lib/access';
import {database,bucket} from '@/lib/storage';
import snapshot from '@/data/inventory-snapshot.json';
import {validSignature} from '@/lib/painting-match';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:Request){
 const a=await workspaceAccess('viewInventory');if(a.response)return a.response;
 try{
  const u=new URL(req.url),site=u.searchParams.get('site')||'',offset=Number(u.searchParams.get('offset')||0),photo=u.searchParams.get('photo');
  if(photo){
   const ref=await database().prepare('SELECT object_key FROM inventory_references WHERE id=?').bind(photo).first<{object_key:string}>();
   if(!ref)return json({error:'Reference photo not found.'},404);
   const obj=await bucket().get(ref.object_key);if(!obj)return json({error:'Reference photo not found.'},404);
   return new Response(obj.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return json({error:'Invalid page.'},400);
  const results=await database().prepare("SELECT id,site_id,product_id,signature FROM inventory_references WHERE (?='' OR site_id=?) ORDER BY id LIMIT 201 OFFSET ?").bind(site,site,offset).all<{id:string;site_id:string;product_id:string;signature:string}>();
  const products=new Map(snapshot.products.map(p=>[p.siteId+':'+p.id,p]));
  return json({loadedAt:snapshot.loadedAt,hasMore:results.results.length>200,nextOffset:offset+200,references:results.results.slice(0,200).flatMap(r=>{const p=products.get(r.site_id+':'+r.product_id);return p?[{id:r.id,signature:JSON.parse(r.signature),product:p}]:[]})});
 }catch{return json({error:'Reference images could not load. Please try again.'},503)}
}
export async function POST(req:Request){
 const origin=req.headers.get('origin');if(origin!==new URL(req.url).origin)return json({error:'Invalid request origin.'},403);
 const a=await workspaceAccess('viewInventory');if(a.response)return a.response;
 let objectKey='';
 try{
  if(Number(req.headers.get('content-length')||0)>1_000_000)return json({error:'Photo is too large.'},413);
  const form=await req.formData(),site=String(form.get('siteId')||''),productId=String(form.get('productId')||''),file=form.get('photo');
  if(!snapshot.products.some(p=>p.siteId===site&&p.id===productId))return json({error:'Inventory product not found.'},404);
  const signature=JSON.parse(String(form.get('signature')||'null'));
  if(!validSignature(signature)||!(file instanceof File)||file.size>700_000||file.size<10)return json({error:'Invalid reference photo.'},400);
  const data=await file.arrayBuffer(),bytes=new Uint8Array(data);if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return json({error:'Use a JPEG reference photo.'},400);
  const id=crypto.randomUUID();objectKey='inventory-reference/'+id;
  const old=await database().prepare('SELECT object_key FROM inventory_references WHERE site_id=? AND product_id=?').bind(site,productId).first<{object_key:string}>();
  await bucket().put(objectKey,data,{httpMetadata:{contentType:'image/jpeg'}});
  await database().prepare('INSERT INTO inventory_references (id,site_id,product_id,object_key,signature,updated) VALUES (?,?,?,?,?,?) ON CONFLICT(site_id,product_id) DO UPDATE SET id=excluded.id,object_key=excluded.object_key,signature=excluded.signature,updated=excluded.updated').bind(id,site,productId,objectKey,JSON.stringify(signature),Date.now()).run();
  objectKey='';if(old)try{await bucket().delete(old.object_key)}catch{}
  return json({ok:true});
 }catch{if(objectKey)try{await bucket().delete(objectKey)}catch{}return json({error:'Could not save reference photo.'},503)}
}
