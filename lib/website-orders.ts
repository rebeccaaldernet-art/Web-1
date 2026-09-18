// Payload fields are grounded in Wix's wix_e_commerce-order_placed trigger schema.
export function normalizeWebsiteOrder(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid order');
 const d=value as Record<string,any>,str=(v:unknown,max=500)=>typeof v==='string'?v.slice(0,max):'';
 if(typeof d.id!=='string'||!d.id||d.id.length>100||!Number.isFinite(Date.parse(d.createdDate)))throw Error('Order ID and date are required');
 if(!Array.isArray(d.lineItems)||d.lineItems.length>500)throw Error('Invalid items');
 const contact=d.billingInfo?.contactDetails||d.shippingInfo?.logistics?.shippingDestination?.contactDetails||{};
 const items=d.lineItems.map((item:any)=>({name:str(item.itemName),sku:str(item.sku),quantity:Number.isSafeInteger(item.quantity)&&item.quantity>=0?item.quantity:0,options:Array.isArray(item.descriptionLines)?item.descriptionLines.slice(0,30).map((o:any)=>[str(o.name,100),str(o.description)].filter(Boolean).join(': ')):[]}));
 const address=d.shippingInfo?.logistics?.shippingDestination?.address||{};
 const total=str(d.priceSummary?.total?.value,40);if(total&&!/^\d+(\.\d+)?$/.test(total))throw Error('Invalid total');
 return {sourceUpdated:Number.isFinite(Date.parse(d.updatedDate))?Date.parse(d.updatedDate):Date.parse(d.createdDate),orderId:d.id,orderNumber:str(d.orderNumber,100)||d.id,created:Date.parse(d.createdDate),customer:[str(contact.firstName,100),str(contact.lastName,100)].filter(Boolean).join(' '),email:str(d.buyerEmail,254),currency:str(d.currency,3),total,payment:str(d.paymentStatus,80),fulfillment:str(d.fulfillmentStatus,80),status:str(d.status,80),items:JSON.stringify(items),shipping:[address.addressLine,address.addressLine2,address.city,address.subdivision,address.postalCode,address.country].map(v=>str(v,200)).filter(Boolean).join(', '),note:str(d.buyerNote,2000)};
}

// Wix validated the Order placed trigger on these five sites on 2026-09-14.
export const orderCapableSites=['110742f0-dc02-40f3-8ab1-59a5890fab9d','faa072bb-65e2-4eeb-95d8-6d5b668a8282','093b21f6-f1d6-43cb-8b04-a6c9f1b6707e','1b7234c3-95a4-4cbe-9b6c-63e6cc20c585','5800da1e-a509-4fe4-a595-4e4d17ea717b'];
