import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
let status=200;
const products=Array.from({length:121},(_,i)=>({id:String(i),siteId:'main',name:'Product '+i,sku:'SKU-'+i,quantity:i===1?null:i,price:i===1?null:121-i,currency:i%2?'USD':'EUR'}));
const modules={
 '@/data/inventory-snapshot.json':{products,loadedAt:'2026-09-14T00:00:00Z'},
 '@/lib/access':{workspaceAccess:async permission=>{assert.equal(permission,'viewInventory');return status===200?{member:{}}:{response:Response.json({}, {status})}}},
 '@/lib/inventory':{inventorySites:[{id:'main',supported:true},{id:'empty',supported:false}]}
};
const context={exports:{},URL,Response,require:name=>modules[name]};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/inventory/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);
const get=q=>context.exports.GET(new Request('https://example.test/api/inventory'+q));
let d=await (await get('?page=2')).json();assert.equal(d.products.length,21);assert.equal(d.total,121);assert.equal(d.hasMore,false);
d=await (await get('?q=SKU-120')).json();assert.equal(d.products.length,1);assert.equal(d.products[0].id,'120');
d=await (await get('?site=empty')).json();assert.equal(d.total,0);
d=await (await get('')).json();assert.equal(d.products[0].quantity,0);assert.equal(d.products[1].quantity,null);
assert.equal((await get('?page=-1')).status,400);assert.equal((await get('?site=unknown')).status,400);
assert.equal((await get('?sort=invalid')).status,400);
for(const sort of ['name_asc','name_desc','quantity_asc','quantity_desc','price_asc','price_desc']){
 const rows=[];
 for(let page=0;page<3;page++)rows.push(...(await (await get('?sort='+sort+'&page='+page)).json()).products);
 assert.equal(rows.length,121);assert.equal(new Set(rows.map(p=>p.id)).size,121);
 const direction=sort.endsWith('desc')?-1:1;
 for(let i=1;i<rows.length;i++){
  const a=rows[i-1],b=rows[i];
  if(sort.startsWith('name')){assert.ok(direction*a.name.localeCompare(b.name)<=0);continue}
  const key=sort.startsWith('quantity')?'quantity':'price';
  if(b[key]===null)continue;
  assert.notEqual(a[key],null);
  if(key==='price'&&a.currency!==b.currency)assert.ok(a.currency.localeCompare(b.currency)<=0);
  else assert.ok(direction*(a[key]-b[key])<=0);
 }
}
for(status of [401,403])assert.equal((await get('')).status,status);
console.log('PASS: global sorting across scroll batches, complete-catalog search, site filtering, zero vs unknown quantity, and access checks.');
