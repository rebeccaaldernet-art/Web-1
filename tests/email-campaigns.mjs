// Synthetic end-to-end check of bulk email campaigns against a mocked Resend API. No real email is sent.
import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import ts from 'typescript';import crypto from 'node:crypto';
const sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>/^\d{4}_.*\.sql$/.test(f)).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
sql.exec("INSERT INTO members (id,user_id,email,name,role,status,created) VALUES ('owner','owner-user','owner@studio.test','Owner','owner','active',1),('admin','admin-user','admin@studio.test','Admin','admin','active',1)");
const db={prepare(q){let args=[];return {bind(...v){args=v;return this},async first(){return sql.prepare(q).get(...args)??null},async all(){return {results:sql.prepare(q).all(...args)}},async run(){return {meta:sql.prepare(q).run(...args)}}}},async batch(st){sql.exec('BEGIN');try{const r=[];for(const s of st)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
const webhookKey=crypto.randomBytes(24);
const env={RESEND_API_KEY:'re_test_key_123456',EMAIL_LINK_SECRET:'x'.repeat(40),RESEND_WEBHOOK_SECRET:'whsec_'+webhookKey.toString('base64')};
let actor='owner';
const runtime={env,database:()=>db,workspaceAccess:async()=>{const m=sql.prepare('SELECT * FROM members WHERE id=?').get(actor);return m?{member:m,user:{}}:{response:Response.json({},{status:401})}}};
globalThis.emailTest=runtime;
async function load(p,names){let source=fs.readFileSync(p,'utf8').replace(/^import .*;\s*$/gm,'');source=`const {${names}}=globalThis.emailTest;\n`+source;return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'))}
const lib=await load('lib/email-campaigns.ts','env,workspaceAccess,database');Object.assign(runtime,lib);
const names='database,'+Object.keys(lib).join(',');
const api=await load('app/api/email/route.ts',names),unsub=await load('app/api/email/unsubscribe/route.ts',names),hook=await load('app/api/email/webhook/route.ts',names);

// Mock Resend: records calls, replays responses per Idempotency-Key, and can be told to fail the next calls.
const calls=[],replays=new Map();let failNext=[],ids=0;
globalThis.fetch=async(url,init)=>{assert.equal(url,'https://api.resend.com/emails/batch');assert.equal(init.headers.Authorization,'Bearer '+env.RESEND_API_KEY);const key=init.headers['Idempotency-Key'],body=JSON.parse(init.body);
 if(replays.has(key)){calls.push({key,body,replay:true});return Response.json(replays.get(key))}
 calls.push({key,body});const fail=failNext.shift();if(fail)return Response.json({message:'Too many requests'},{status:fail});
 assert.ok(body.length>=1&&body.length<=100);const out={data:body.map(()=>({id:'re_'+(++ids)}))};replays.set(key,out);return Response.json(out)};

const origin='https://portal.test';
const post=(body,o=origin)=>api.POST(new Request(origin+'/api/email',{method:'POST',headers:{'Content-Type':'application/json',...(o?{Origin:o}:{})},body:JSON.stringify(body)}));
const ok=async(r,status=200)=>{const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d};
const detail=async id=>ok(await api.GET(new Request(origin+'/api/email?campaign='+id)));

// Access: owner only; cross-origin writes rejected.
actor='admin';assert.equal((await api.GET(new Request(origin+'/api/email'))).status,403);assert.equal((await post({action:'create',name:'x'})).status,403);actor='owner';
assert.equal((await post({action:'create',name:'x'},'https://evil.test')).status,403);
assert.equal((await post({action:'create',name:'x'},null)).status,403);

// Sender settings require a postal address.
await ok(await post({action:'settings',from_name:'RA Studio',from_email:'news@studio.test',reply_to:'',postal_address:''}),400);
await ok(await post({action:'settings',from_name:'RA Studio',from_email:'news@studio.test',reply_to:'hello@studio.test',postal_address:'1 Gallery Road\nPortland, OR 97201'}));

const {id}=await ok(await post({action:'create',name:'Autumn collection'}));
let d=await detail(id);assert.equal(d.campaign.state,'draft');
await ok(await post({action:'update',campaign:id,revision:99,name:'Autumn',subject:'Hi',html:'<p>x</p>',text:''}),409);
await ok(await post({action:'update',campaign:id,revision:1,name:'Autumn collection',subject:'New work for {{name}}',html:'<p>Hello {{name}}, see the new paintings.</p>',text:''}));

// Recipients: consent required, per-request cap, dedupe and validation.
await ok(await post({action:'recipients',campaign:id,consent:false,recipients:[{email:'a@x.test'}]}),400);
await ok(await post({action:'recipients',campaign:id,consent:true,recipients:Array.from({length:1001},(_,i)=>({email:`p${i}@x.test`}))}),400);
let r=await ok(await post({action:'recipients',campaign:id,consent:true,recipients:[{email:' Mixed@Case.TEST ',name:'Tom & "Jerry" <b>'},{email:'mixed@case.test'},{email:'not-an-email'},{email:'bad@@x.test'}]}));
assert.deepEqual([r.added,r.invalid],[1,2]);
const TOTAL=100000;const started=Date.now();
for(let i=0;i<TOTAL-1;i+=1000){const part=Array.from({length:Math.min(1000,TOTAL-1-i)},(_,j)=>({email:`person${i+j}@example.test`,name:`Person ${i+j}`}));r=await ok(await post({action:'recipients',campaign:id,consent:true,recipients:part}));assert.equal(r.added,part.length)}
r=await ok(await post({action:'recipients',campaign:id,consent:true,recipients:[{email:'person5@example.test'}]}));assert.equal(r.duplicates,1);
d=await detail(id);assert.equal(d.counts.queued,TOTAL);

// Suppressed before send.
await ok(await post({action:'suppress',emails:['person7@example.test','nope']}));

// Approval gates: tested revision, exact count.
await ok(await post({action:'approve',campaign:id,revision:2,confirmCount:TOTAL}),409);
await ok(await post({action:'test',campaign:id,revision:2}));
assert.equal(calls.length,1);assert.match(calls[0].body[0].subject,/^\[Test\] New work for Test Recipient$/);assert.deepEqual(calls[0].body[0].to,['owner@studio.test']);
await ok(await post({action:'approve',campaign:id,revision:2,confirmCount:TOTAL}),400);
await ok(await post({action:'approve',campaign:id,revision:2,confirmCount:TOTAL-1}));
await ok(await post({action:'update',campaign:id,revision:2,name:'x',subject:'x',html:'x'}),409);
d=await detail(id);assert.equal(d.campaign.state,'sending');assert.equal(d.counts.suppressed,1);

// First dispatch: 5 batches of 100; message content and headers.
calls.length=0;let out=await ok(await post({action:'dispatch',campaign:id}));assert.equal(out.sent,500);assert.equal(calls.length,5);
const first=calls[0].body[0];assert.equal(first.from,'RA Studio <news@studio.test>');assert.equal(first.reply_to,'hello@studio.test');
assert.match(first.headers['List-Unsubscribe'],/^<https:\/\/portal\.test\/api\/email\/unsubscribe\?r=\d+&t=[\w-]+>$/);assert.equal(first.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
assert.match(first.html,/Portland, OR 97201/);assert.match(first.text,/Unsubscribe: https:\/\/portal\.test/);
const eve=sql.prepare("SELECT id FROM email_recipients WHERE email='mixed@case.test'").get();
const eveMsg=calls[0].body.find(m=>m.to[0]==='mixed@case.test');assert.ok(eveMsg);assert.match(eveMsg.html,/Hello Tom &amp; &quot;Jerry&quot; b,/);assert.equal(eveMsg.subject,'New work for Tom & "Jerry" b');

// Provider throttling: the lease is kept, not re-sent early, then retried with the same idempotency key.
calls.length=0;failNext=[429];out=await ok(await post({action:'dispatch',campaign:id}));assert.equal(out.sent,0);assert.ok(out.warning);assert.equal(calls.length,1);
const throttledKey=calls[0].key;assert.equal(sql.prepare("SELECT COUNT(*) n FROM email_recipients WHERE status='sending'").get().n,100);
calls.length=0;out=await ok(await post({action:'dispatch',campaign:id}));assert.ok(calls.every(c=>c.key!==throttledKey));
sql.exec("UPDATE email_recipients SET leased=0 WHERE status='sending'");calls.length=0;out=await ok(await post({action:'dispatch',campaign:id}));assert.equal(calls[0].key,throttledKey);
// A crash after the provider accepted a batch is replayed, not duplicated.
const sentKey=calls[1].key;sql.prepare("UPDATE email_recipients SET status='sending',leased=0 WHERE lease=?").run(sentKey.split(':')[1]);
calls.length=0;await ok(await post({action:'dispatch',campaign:id}));assert.equal(calls[0].key,sentKey);assert.equal(calls[0].replay,true);

// Unsubscribe: GET only confirms; POST suppresses; forged token rejected.
const link=new URL(eveMsg.headers['List-Unsubscribe'].slice(1,-1));
assert.equal((await unsub.GET(new Request(link))).status,200);assert.equal(sql.prepare("SELECT COUNT(*) n FROM email_suppressions WHERE email='mixed@case.test'").get().n,0);
assert.equal((await unsub.POST(new Request(link.href.replace(/t=[\w-]+/,'t=forged'),{method:'POST'}))).status,400);
assert.equal((await unsub.POST(new Request(link,{method:'POST',body:'List-Unsubscribe=One-Click'}))).status,200);
assert.equal(sql.prepare("SELECT reason FROM email_suppressions WHERE email='mixed@case.test'").get().reason,'unsubscribe');
assert.equal((await unsub.POST(new Request(`${origin}/api/email/unsubscribe?r=${eve.id+1}&t=${link.searchParams.get('t')}`,{method:'POST'}))).status,400);
// A later unsubscribe removes still-queued rows from this send.
const late=sql.prepare("SELECT id FROM email_recipients WHERE email='person99990@example.test'").get();
assert.equal((await unsub.POST(new Request(await lib.unsubscribeUrl(origin,late.id),{method:'POST'}))).status,200);

// Webhook: Svix signature required; hard bounces and complaints are suppressed.
const sign=(body,idv='msg_1',ts=Math.floor(Date.now()/1000))=>({'svix-id':idv,'svix-timestamp':String(ts),'svix-signature':'v1,'+crypto.createHmac('sha256',webhookKey).update(`${idv}.${ts}.${body}`).digest('base64')});
const bounced=sql.prepare("SELECT provider_id,email FROM email_recipients WHERE status='sent' AND email NOT IN (SELECT email FROM email_suppressions) LIMIT 1").get();
const bounce=JSON.stringify({type:'email.bounced',data:{email_id:bounced.provider_id,to:[bounced.email],bounce:{type:'Permanent'}}});
assert.equal((await hook.POST(new Request(origin+'/api/email/webhook',{method:'POST',headers:{...sign(bounce),'svix-signature':'v1,AAAA'},body:bounce}))).status,401);
assert.equal((await hook.POST(new Request(origin+'/api/email/webhook',{method:'POST',headers:sign(bounce,'msg_1',1),body:bounce}))).status,401);
assert.equal((await hook.POST(new Request(origin+'/api/email/webhook',{method:'POST',headers:sign(bounce),body:bounce}))).status,200);
assert.equal(sql.prepare('SELECT status FROM email_recipients WHERE provider_id=?').get(bounced.provider_id).status,'bounced');
assert.equal(sql.prepare('SELECT reason FROM email_suppressions WHERE email=?').get(bounced.email).reason,'bounce');

// Pause stops dispatch; resume continues to completion.
await ok(await post({action:'pause',campaign:id}));calls.length=0;out=await ok(await post({action:'dispatch',campaign:id}));assert.equal(out.state,'paused');assert.equal(calls.length,0);
await ok(await post({action:'resume',campaign:id}));
let loops=0;do{out=await ok(await post({action:'dispatch',campaign:id}));loops++}while(out.state==='sending'&&loops<400);
assert.equal(out.state,'complete');
d=await detail(id);const unique=new Set(sql.prepare("SELECT email FROM email_recipients WHERE status IN ('sent','bounced')").all().map(x=>x.email));
assert.equal(d.counts.queued||0,0);assert.equal(d.counts.sending||0,0);assert.equal(d.counts.failed||0,0);
assert.equal((d.counts.sent||0)+(d.counts.bounced||0),TOTAL-2);assert.equal(unique.size,TOTAL-2);assert.equal(d.counts.suppressed,2);
assert.ok(!unique.has('person7@example.test')&&!unique.has('person99990@example.test'));
const providerIds=sql.prepare("SELECT COUNT(DISTINCT provider_id) n FROM email_recipients WHERE provider_id IS NOT NULL").get().n;assert.equal(providerIds,TOTAL-2);

// Cancel leaves no queued rows; missing secrets block sending honestly.
const second=(await ok(await post({action:'create',name:'Second'}))).id;
await ok(await post({action:'recipients',campaign:second,consent:true,recipients:[{email:'q@x.test'}]}));
await ok(await post({action:'cancel',campaign:second}));assert.equal((await detail(second)).counts.cancelled,1);
const third=(await ok(await post({action:'create',name:'Third'}))).id;await ok(await post({action:'update',campaign:third,revision:1,name:'Third',subject:'S',html:'<p>b</p>'}));
delete env.RESEND_API_KEY;await ok(await post({action:'test',campaign:third,revision:2}),503);
console.log(`PASS: owner-only access and origin checks; settings validation; revision checks; opt-in consent gate; dedupe/validation; ${TOTAL.toLocaleString()} synthetic recipients uploaded and sent in ${loops+7} dispatch calls (${((Date.now()-started)/1000).toFixed(1)}s) with no duplicates; test-before-send and count confirmation; suppression before send; List-Unsubscribe one-click headers, footer and escaping; throttling retry with the same idempotency key and crash replay; signed unsubscribe (GET safe, forged rejected); Svix-verified bounce webhook; pause/resume; completion; cancel; missing secrets reported, not faked.`);
