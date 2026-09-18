import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';import ts from 'typescript';
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const data={exports:{}};vm.runInNewContext(compile('lib/wix-sites.ts'),data);const {wixSites}=data.exports;
assert.equal(wixSites.length,7);assert.equal(new Set(wixSites.map(s=>s.id)).size,7);assert.equal(wixSites.filter(s=>s.url).length,2);
for(const site of wixSites){const editor=new URL(site.editorUrl);assert.equal(editor.protocol,'https:');assert.equal(editor.hostname,'editor.wix.com');assert.equal(editor.searchParams.get('metaSiteId'),site.id);assert.equal(new URL(site.dashboardUrl).pathname,'/dashboard/'+site.id+'/home');if(site.url)assert.equal(new URL(site.url).protocol,'https:');}
let denial=Response.json({error:'Sign in required'},{status:401});
const route={exports:{},Response,console,require:n=>n.includes('/access')?{workspaceAccess:async()=>denial?{response:denial}:{member:{status:'active'}}}:{wixSites}};
vm.runInNewContext(compile('app/api/wix-sites/route.ts'),route);
assert.equal((await route.exports.GET()).status,401);denial=Response.json({error:'Access removed'},{status:403});assert.equal((await route.exports.GET()).status,403);denial=null;const response=await route.exports.GET();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal((await response.json()).sites.length,7);
console.log('PASS: seven real site/editor pairs, two public URLs, no-store response and membership guards.');
