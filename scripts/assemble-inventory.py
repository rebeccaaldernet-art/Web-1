import json,sys,pathlib
source=pathlib.Path(sys.argv[1])
pages=[json.loads(p.read_text()) for p in source.glob('*.json')]
sites=sorted(set(p['siteId'] for p in pages))
if len(sites)!=4: raise SystemExit('Expected all four Wix Stores catalogs')
products=[];counts={}
for site in sites:
 group=sorted([p for p in pages if p['siteId']==site],key=lambda p:p['offset'])
 totals=set(p['total'] for p in group)
 if len(totals)!=1: raise SystemExit('Catalog changed during import; reconcile '+site)
 total=totals.pop()
 if [p['offset'] for p in group]!=list(range(0,total,100)): raise SystemExit('Missing catalog pages for '+site)
 records={}
 for page in group:
  for row in page['rows']:
   if len(row)!=10: raise SystemExit('Unexpected product shape')
   id,name,sku,quantity,inStock,tracked,visible,currency,price,variants=row
   records[id]={'id':id,'siteId':site,'name':name,'sku':sku,'quantity':quantity,'inStock':inStock,'tracked':tracked,'visible':visible,'currency':currency,'price':price,'variants':variants,'image':'','url':f'https://manage.wix.com/dashboard/{site}/wix-stores/products/product/{id}'}
 if len(records)!=total: raise SystemExit(f'Unique product count mismatch: {site} {len(records)} != {total}')
 counts[site]=len(records);products.extend(records.values())
products.sort(key=lambda p:(p['name'].casefold(),p['siteId'],p['id']))
out=pathlib.Path('data/inventory-snapshot.json');out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps({'loadedAt':max(p['loadedAt'] for p in pages),'startedAt':min(p['loadedAt'] for p in pages),'products':products},ensure_ascii=False,separators=(',',':')))
print(json.dumps({'total':len(products),'sites':counts,'tracked':sum(p['tracked'] for p in products),'withQuantity':sum(p['quantity'] is not None for p in products),'zeroStock':sum(p['quantity']==0 for p in products)}))
