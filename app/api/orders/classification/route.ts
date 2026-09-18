import {workspaceAccess} from '@/lib/access';
import {database} from '@/lib/storage';
export async function POST(req:Request){
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Invalid origin.'},{status:403});
 const auth=await workspaceAccess('viewOrders');if(auth.response)return auth.response;
 if(!['owner','admin'].includes(auth.member!.role))return Response.json({error:'Only owners and admins can classify orders.'},{status:403});
 try{const d=await req.json() as Record<string,unknown>;if(!d||typeof d!=='object'||typeof d.siteId!=='string'||typeof d.orderId!=='string'||!['B2B','B2C','Unclassified'].includes(String(d.segment)))return Response.json({error:'Choose B2B, B2C or Unclassified.'},{status:400});
 const db=database();if(!await db.prepare('SELECT order_id FROM website_orders WHERE site_id=? AND order_id=?').bind(d.siteId,d.orderId).first())return Response.json({error:'Order not found.'},{status:404});
 await db.prepare('INSERT INTO order_classifications (site_id,order_id,segment,updated_by,updated) VALUES (?,?,?,?,?) ON CONFLICT(site_id,order_id) DO UPDATE SET segment=excluded.segment,updated_by=excluded.updated_by,updated=excluded.updated').bind(d.siteId,d.orderId,d.segment,auth.member!.id,Date.now()).run();
 return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'Classification could not be saved.'},{status:503})}
}
