import {env} from 'cloudflare:workers';
import {bucket} from './storage';
import {sealCredential,openCredential} from './credential-seal';
import {inventorySites,normalizeProduct} from './inventory';
const connectionPath='private-integrations/wix-inventory-v1';
export type WixConnection={apiKey:string;sites:string[];includeHidden:boolean;updated:string};
function encryptionKey(){const key=(env as unknown as {WIX_INVENTORY_ENCRYPTION_KEY?:string}).WIX_INVENTORY_ENCRYPTION_KEY;if(!key)throw Error('Secure connection setup is not available yet.');return key}
export function connectionReady(){return !!(env as unknown as {WIX_INVENTORY_ENCRYPTION_KEY?:string}).WIX_INVENTORY_ENCRYPTION_KEY}
export async function getWixConnection():Promise<WixConnection|null>{const obj=await bucket().get(connectionPath);if(!obj)return null;return JSON.parse(await openCredential(await obj.json(),encryptionKey()))}
export async function saveWixConnection(value:WixConnection){await bucket().put(connectionPath,JSON.stringify(await sealCredential(JSON.stringify(value),encryptionKey())),{httpMetadata:{contentType:'application/json'}})}
export async function removeWixConnection(){await bucket().delete(connectionPath)}
export function liveQuery(q:string,sort:string,page:number,limit=50){
 const field=sort.startsWith('price')?'price':sort.startsWith('updated')?'lastUpdated':'name';
 return {paging:{limit,offset:page*50},sort:JSON.stringify([{fieldName:field,order:sort.endsWith('_desc')?'DESC':'ASC'},{fieldName:'id',order:'ASC'}]),...(q?{filter:JSON.stringify({$or:[{name:{$contains:q}},{sku:{$contains:q}}]})}:{})};
}
export async function queryWixInventory(connection:WixConnection,site:string,q='',sort='name_asc',page=0,limit=50){
 if(!connection.sites.includes(site)||!inventorySites.some(s=>s.id===site&&s.supported))throw Error('Connect this website first.');
 let response:Response;
 try{response=await fetch('https://www.wixapis.com/stores-reader/v1/products/query',{method:'POST',headers:{Authorization:connection.apiKey,'wix-site-id':site,'Content-Type':'application/json'},body:JSON.stringify({query:liveQuery(q,sort,page,limit),includeHiddenProducts:connection.includeHidden}),signal:AbortSignal.timeout(20000),redirect:'error',cache:'no-store'})}catch{throw Error('Wix did not respond. Your last results may be out of date. Please try again.');}
 if(!response.ok)throw Error(response.status===401||response.status===403?'Wix denied access. Check the API key, website access, and product permissions.':response.status===429?'Wix is limiting requests. Please wait a minute before trying again.':'Wix inventory is temporarily unavailable. Please try again.');
 const data=await response.json() as {products:any[];totalResults:number};
 if(!Array.isArray(data.products)||!Number.isSafeInteger(data.totalResults))throw Error('Wix returned an unexpected inventory response.');
 return {products:data.products.map(p=>normalizeProduct(p,site)),total:data.totalResults,hasMore:page*50+data.products.length<data.totalResults,page,checkedAt:new Date().toISOString()};
}
