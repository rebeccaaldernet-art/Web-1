"""Attach API-returned product links by site/product ID without changing stock."""
import json, pathlib, sys
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
source = pathlib.Path(sys.argv[1])
path = pathlib.Path('data/inventory-snapshot.json')
snapshot = json.loads(path.read_text())
records, checked = {}, set()
for page in source.glob('*.json'):
    payload = json.loads(page.read_text())
    for target in payload['targets']:
        checked.update((target['siteId'], ident) for ident in target['ids'])
    for result in payload['data']:
        if result.get('error'):
            raise ValueError(result['error'])
        strings = result['strings']
        for ident, base_index, product_path, prefix, image, suffix in result['rows']:
            base = strings[base_index]
            url = urljoin(base, product_path) if base and product_path else ''
            if url and (urlparse(url).scheme != 'https' or urlparse(url).netloc != urlparse(base).netloc):
                raise ValueError('Invalid product URL')
            image_url = strings[prefix] + image + strings[suffix]
            if image_url and urlparse(image_url).scheme != 'https':
                raise ValueError('Invalid image URL')
            records[result['siteId'], ident] = (url, image_url)
published = {'faa072bb-65e2-4eeb-95d8-6d5b668a8282', '1b7234c3-95a4-4cbe-9b6c-63e6cc20c585'}
missing = [(p['siteId'], p['id']) for p in snapshot['products'] if p['siteId'] in published and (p['siteId'], p['id']) not in checked]
if missing:
    raise ValueError(f'{len(missing)} published-site inventory records still need a lookup')
counts = {}
for p in snapshot['products']:
    key = p['siteId'], p['id']
    url, image = records.get(key, ('', p.get('image', '')))
    status = 'available' if url else 'unpublished' if p['siteId'] not in published else 'unavailable'
    if not p['visible']:
        url, status = '', 'hidden'
    elif key in checked and key not in records:
        url, status = '', 'not-found'
    p.update(productUrl=url, linkStatus=status, image=image)
    counts[status] = counts.get(status, 0) + 1
snapshot['linksUpdatedAt'] = datetime.now(timezone.utc).isoformat()
path.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')))
print(json.dumps({'total':len(snapshot['products']), 'links':counts, 'pictures':sum(bool(p['image']) for p in snapshot['products'])}))
