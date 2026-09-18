import snapshot from '@/data/inventory-snapshot.json';
import {workspaceAccess} from '@/lib/access';
import {inventorySites} from '@/lib/inventory';
export async function GET(req:Request){
 const auth=await workspaceAccess('viewInventory');if(auth.response)return auth.response;
 const u=new URL(req.url),site=u.searchParams.get('site')||'',page=Number(u.searchParams.get('page')||0);
 if(!Number.isSafeInteger(page)||page<0||page>100000||(site&&!inventorySites.some(s=>s.id===site)))return Response.json({error:'Invalid inventory page or website.'},{status:400});

 const q=(u.searchParams.get('q')||'').trim().toLocaleLowerCase();
 if(q.length>200)return Response.json({error:'Search is too long.'},{status:400});
 const sort=u.searchParams.get('sort')||'name_asc';
 if(!['name_asc','name_desc','quantity_asc','quantity_desc','price_asc','price_desc'].includes(sort))return Response.json({error:'Invalid sort option.'},{status:400});
 const rows=snapshot.products.filter(p=>(!site||p.siteId===site)&&(!q||p.name.toLocaleLowerCase().includes(q)||p.sku.toLocaleLowerCase().includes(q)));
 const direction=sort.endsWith('_desc')?-1:1;
 const tie=(a:typeof rows[number],b:typeof rows[number])=>a.name.localeCompare(b.name)||a.siteId.localeCompare(b.siteId)||a.id.localeCompare(b.id);
 rows.sort((a,b)=>{
  if(sort.startsWith('name'))return direction*a.name.localeCompare(b.name)||tie(a,b);
  const key=sort.startsWith('quantity')?'quantity':'price';
  if(a[key]===null||b[key]===null)return a[key]===b[key]?tie(a,b):a[key]===null?1:-1;
  if(key==='price'&&a.currency!==b.currency)return a.currency.localeCompare(b.currency);
  return direction*(a[key]-b[key])||tie(a,b);
 });
 return Response.json({
 loaded:true,snapshot:true,loadedAt:snapshot.loadedAt,referenceSiteId:'faa072bb-65e2-4eeb-95d8-6d5b668a8282',
 sites:inventorySites,products:rows.slice(page*50,(page+1)*50),total:rows.length,page,hasMore:(page+1)*50<rows.length,
 results:inventorySites.filter(s=>s.supported).map(s=>({siteId:s.id,total:snapshot.products.filter(p=>p.siteId===s.id).length,checked:snapshot.loadedAt,error:''}))
 },{headers:{'Cache-Control':'private, no-store'}});
}
