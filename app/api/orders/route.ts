import {effectivePermissions} from '@/lib/permissions';
import {env} from 'cloudflare:workers';
import {workspaceAccess} from '@/lib/access';
import {database} from '@/lib/storage';
import {wixSites} from '@/lib/wix-sites';
import {orderCapableSites} from '@/lib/website-orders';
export async function GET(req:Request){
 const auth=await workspaceAccess('viewOrders');if(auth.response)return auth.response;
 try{const url=new URL(req.url),site=url.searchParams.get('site')||'',q=(url.searchParams.get('q')||'').slice(0,200),page=Math.max(0,Math.min(100000,Number(url.searchParams.get('page'))||0));
 const filter="WHERE (?='' OR site_id=?) AND (?='' OR instr(lower(order_number||' '||customer||' '||email),lower(?))>0)";
 const rows=await database().prepare("SELECT o.*,COALESCE((SELECT segment FROM order_classifications c WHERE c.site_id=o.site_id AND c.order_id=o.order_id),'Unclassified') segment FROM website_orders o "+filter+' ORDER BY created DESC,order_id DESC LIMIT 51 OFFSET ?').bind(site,site,q,q,Math.floor(page)*50).all<Record<string,unknown>>();
 const enabled=JSON.parse((env as unknown as {WIX_ORDERS_ENABLED_SITES?:string}).WIX_ORDERS_ENABLED_SITES||'[]') as string[];
 return Response.json({canAnalyze:effectivePermissions(auth.member!).viewAnalytics,canClassify:['owner','admin'].includes(auth.member!.role),orders:rows.results.slice(0,50).map(o=>({...o,items:JSON.parse(o.items as string)})),hasMore:rows.results.length>50,sites:wixSites.map(s=>({id:s.id,name:s.name,supported:orderCapableSites.includes(s.id),connected:enabled.includes(s.id)}))},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'Orders could not load. Please try again.'},{status:503})}
}
