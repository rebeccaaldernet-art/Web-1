import {workspaceAccess} from '@/lib/access';
import {getWixConnection,queryWixInventory} from '@/lib/live-wix-inventory';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:Request){const auth=await workspaceAccess('viewInventory');if(auth.response)return auth.response;const u=new URL(req.url),site=u.searchParams.get('site')||'',q=(u.searchParams.get('q')||'').trim(),sort=u.searchParams.get('sort')||'name_asc',page=Number(u.searchParams.get('page')||0);
 if(q.length>200||!Number.isSafeInteger(page)||page<0||page>100000||!['name_asc','name_desc','price_asc','price_desc','updated_desc'].includes(sort))return json({error:'Invalid inventory query.'},400);
 try{const c=await getWixConnection();if(!c)return json({error:'Connect Wix inventory first.'},409);if(!c.sites.includes(site))return json({error:'This website is not connected.'},400);return json(await queryWixInventory(c,site,q,sort,page))}catch(e){return json({error:e instanceof Error?e.message:'Live inventory could not load.'},503)}}
