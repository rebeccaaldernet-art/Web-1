import {workspaceAccess} from '@/lib/access';
import {inventorySites} from '@/lib/inventory';
import {connectionReady,getWixConnection,saveWixConnection,removeWixConnection,queryWixInventory,type WixConnection} from '@/lib/live-wix-inventory';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(){const auth=await workspaceAccess('viewInventory');if(auth.response)return auth.response;try{const c=await getWixConnection();return json({configured:!!c,canManage:auth.member.role==='owner',ready:connectionReady(),sites:inventorySites.filter(s=>s.supported).map(s=>({id:s.id,name:s.name,connected:!!c?.sites.includes(s.id)})),includeHidden:c?.includeHidden??false,updated:c?.updated??null})}catch{return json({error:'The Wix connection status could not load.'},503)}}
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Invalid request origin.'},403);
 const auth=await workspaceAccess('viewInventory');if(auth.response)return auth.response;if(auth.member.role!=='owner')return json({error:'Only the owner can connect Wix.'},403);
 try{
  const raw=await req.text();if(raw.length>16000)return json({error:'Connection details are too large.'},400);
  let d:any;try{d=JSON.parse(raw)}catch{return json({error:'Invalid connection details.'},400)}
  if(!d||typeof d.apiKey!=='string'||!d.apiKey.trim()||d.apiKey.length>12000||/[\r\n]/.test(d.apiKey)||!Array.isArray(d.sites)||d.sites.length<1||d.sites.length>4||!d.sites.every((id:unknown)=>inventorySites.some(s=>s.supported&&s.id===id)))return json({error:'Enter an API key and select the websites it can access.'},400);
  const value:WixConnection={apiKey:d.apiKey.trim(),sites:[...new Set<string>(d.sites)],includeHidden:d.includeHidden===true,updated:new Date().toISOString()};
  if(!connectionReady())return json({error:'Secure connection setup is not available yet.'},503);
  const checks=await Promise.allSettled(value.sites.map(site=>queryWixInventory(value,site,'','name_asc',0,1)));
  const failures=checks.flatMap((r,i)=>r.status==='rejected'?[{site:inventorySites.find(s=>s.id===value.sites[i])?.name,error:r.reason instanceof Error?r.reason.message:'Connection failed.'}]:[]);
  if(failures.length)return json({error:failures.map(f=>f.site+': '+f.error).join(' ')+ ' The previous connection, if any, is unchanged.'},400);
  await saveWixConnection(value);return json({ok:true});
 }catch{return json({error:'The connection could not be saved. Please try again.'},503)}
}
export async function DELETE(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Invalid request origin.'},403);const auth=await workspaceAccess('viewInventory');if(auth.response)return auth.response;if(auth.member.role!=='owner')return json({error:'Only the owner can disconnect Wix.'},403);try{await removeWixConnection();return json({ok:true})}catch{return json({error:'Could not disconnect Wix.'},503)}}
