import {wixSites} from './wix-sites';
const catalogs=new Set(['110742f0-dc02-40f3-8ab1-59a5890fab9d','faa072bb-65e2-4eeb-95d8-6d5b668a8282','093b21f6-f1d6-43cb-8b04-a6c9f1b6707e','1b7234c3-95a4-4cbe-9b6c-63e6cc20c585']);
export const inventorySites=wixSites.map(s=>({id:s.id,name:s.name,supported:catalogs.has(s.id),productsUrl:`https://manage.wix.com/dashboard/${s.id}/wix-stores/products`}));
export type InventoryProduct={id:string;siteId:string;name:string;sku:string;image:string;currency:string;price:number|null;quantity:number|null;inStock:boolean|null;tracked:boolean;visible:boolean;variants?:boolean;url:string;productUrl?:string;linkStatus?:string};
export function productWebsiteUrl(page?:{base?:string;path?:string}):string{
 if(!page?.base||!page.path)return '';
 try{const base=new URL(page.base),url=new URL(page.path,base);return base.protocol==='https:'&&url.origin===base.origin?url.href:''}catch{return ''}
}
export function normalizeProduct(p:any,siteId:string):InventoryProduct{
 const price=p.priceData||p.price||{};
 return {variants:p.manageVariants===true,linkStatus:p.visible===false?'hidden':productWebsiteUrl(p.productPageUrl)?'available':'unpublished',productUrl:p.visible===false?'':productWebsiteUrl(p.productPageUrl),id:p.id,siteId,name:p.name||'Unnamed product',sku:p.sku||'',image:p.media?.mainMedia?.thumbnail?.url||'',currency:price.currency||'',price:typeof price.discountedPrice==='number'?price.discountedPrice:typeof price.price==='number'?price.price:null,quantity:p.stock?.trackInventory===true&&typeof p.stock.quantity==='number'?p.stock.quantity:null,inStock:typeof p.stock?.inStock==='boolean'?p.stock.inStock:null,tracked:p.stock?.trackInventory===true,visible:p.visible!==false,url:`https://manage.wix.com/dashboard/${siteId}/wix-stores/products/product/${encodeURIComponent(p.id)}`};
}
