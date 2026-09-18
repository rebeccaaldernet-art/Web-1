import {env} from 'cloudflare:workers';
import {database} from '@/lib/storage';
import {wixSites} from '@/lib/wix-sites';
import {normalizeWebsiteOrder} from '@/lib/website-orders';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:Request){
 try{
  // A per-site secret is sent in the POST body, never in a public URL or browser bundle.
  const text=await req.text();if(text.length>1_000_000)return json({error:'Payload too large'},413);
  let d:Record<string,unknown>;try{d=JSON.parse(text);if(!d||typeof d!=='object'||Array.isArray(d))throw Error()}catch{return json({error:'Invalid payload'},400)}
  const site=wixSites.find(s=>s.id===d.siteId);if(!site)return json({error:'Unauthorized'},401);
  const secrets=JSON.parse((env as unknown as {WIX_ORDER_SECRETS?:string}).WIX_ORDER_SECRETS||'{}');const expected=secrets[site.id];
  if(typeof expected!=='string'||expected.length<32)return json({error:'Order connection not enabled'},503);
  if(typeof d.token!=='string'||d.token.length>256)return json({error:'Unauthorized'},401);
  const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));const a=await digest(expected),b=await digest(d.token);let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];if(mismatch)return json({error:'Unauthorized'},401);
  if(d.verifyBefore!==undefined){
   const cutoff=typeof d.verifyBefore==='string'?Date.parse(d.verifyBefore):NaN;
   if(!Number.isFinite(cutoff))return json({error:'Invalid cutoff'},400);
   const rows=await database().prepare("SELECT currency,COUNT(*) orders,ROUND(SUM(CASE WHEN status NOT IN ('CANCELED','REJECTED') AND total<>'' THEN CAST(total AS REAL) ELSE 0 END),2) value FROM website_orders WHERE site_id=? AND created<? AND status IN ('APPROVED','CANCELED','PENDING','REJECTED') GROUP BY currency ORDER BY currency").bind(site.id,cutoff).all();
   return json({totals:rows.results});
  }
  const batch=d.orders===undefined?[d]:d.orders;
  if(!Array.isArray(batch)||batch.length<1||batch.length>100)return json({error:'Invalid order batch'},400);
  let orders;try{orders=batch.map(normalizeWebsiteOrder)}catch{return json({error:'Invalid order details'},400)}
  // Order-placed retries must never duplicate rows or overwrite their original details.
  const db=database();
  const conflict=d.importHistory===true?' ON CONFLICT(site_id,order_id) DO UPDATE SET order_number=excluded.order_number,created=excluded.created,customer=excluded.customer,email=excluded.email,currency=excluded.currency,total=excluded.total,payment=excluded.payment,fulfillment=excluded.fulfillment,status=excluded.status,items=excluded.items,shipping=excluded.shipping,note=excluded.note,source_updated=excluded.source_updated WHERE excluded.source_updated>=website_orders.source_updated':'';
  await db.batch(orders.map(o=>db.prepare('INSERT OR IGNORE INTO website_orders (site_id,order_id,order_number,created,customer,email,currency,total,payment,fulfillment,status,items,shipping,note,received,source_updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'+conflict).bind(site.id,o.orderId,o.orderNumber,o.created,o.customer,o.email,o.currency,o.total,o.payment,o.fulfillment,o.status,o.items,o.shipping,o.note,Date.now(),o.sourceUpdated)));
  return json({ok:true,accepted:orders.length});
 }catch{return json({error:'Order delivery could not be saved. Please retry.'},503)}
}
