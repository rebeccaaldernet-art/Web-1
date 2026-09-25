// Full-system test with no outside email service: portal API → self-hosted mailer (mailer/) → SMTP to a local
// stand-in for the recipient's mail server → signed delivery/bounce reports back into the portal webhook.
// Requires `npm ci` in mailer/. No mail leaves this machine.
import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import ts from 'typescript';import crypto from 'node:crypto';
import {SMTPServer} from '../mailer/node_modules/smtp-server/lib/smtp-server.js';
import {openDb} from '../mailer/src/db.js';import {createApi} from '../mailer/src/api.js';import {createWorker} from '../mailer/src/worker.js';import {createEventSender} from '../mailer/src/events.js';

// Recipient mail server stand-in: refuses reject@*.
const received=[];
const sink=new SMTPServer({authOptional:true,disabledCommands:['AUTH','STARTTLS'],logger:false,
 onRcptTo(a,s,cb){if(a.address.startsWith('reject@')){const e=new Error('5.1.1 User unknown');e.responseCode=550;return cb(e)}cb()},
 onData(stream,session,cb){const c=[];stream.on('data',d=>c.push(d));stream.on('end',()=>{received.push({to:session.envelope.rcptTo.map(r=>r.address),raw:Buffer.concat(c).toString()});cb()})}});
await new Promise(r=>sink.listen(0,'127.0.0.1',r));

// Portal database and route loader (same harness as the other email tests).
const sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>/^\d{4}_.*\.sql$/.test(f)).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
sql.exec("INSERT INTO members (id,user_id,email,name,role,status,created) VALUES ('owner','owner-user','owner@studio.test','Owner','owner','active',1)");
const db={prepare(q){let args=[];return {bind(...v){args=v;return this},async first(){return sql.prepare(q).get(...args)??null},async all(){return {results:sql.prepare(q).all(...args)}},async run(){return {meta:sql.prepare(q).run(...args)}}}},async batch(st){sql.exec('BEGIN');try{const r=[];for(const s of st)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
const secret=crypto.randomBytes(32).toString('hex');

// The self-hosted mailer, in-process.
const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const mconfig={secret,hostname:'mail.studio.test',allowedFromDomains:['studio.test'],bounceDomain:'bounces.studio.test',dkim:{domainName:'studio.test',keySelector:'ra1',privateKey:privateKey.export({type:'pkcs8',format:'pem'})},dailyLimit:100000,warmupStart:0,warmupGrowth:1.5,warmupStartDate:'',concurrency:10,perDomainConcurrency:5,perDomainPerMinute:1000,maxRetryHours:72,mxOverride:`127.0.0.1:${sink.server.address().port}`,requireTls:false,tickMs:50,portalWebhookUrl:'https://portal.test/api/email/webhook'};
const mdb=openDb(':memory:'),worker=createWorker({config:mconfig,db:mdb}),api=createApi({config:mconfig,db:mdb,worker});
await new Promise(r=>api.listen(0,'127.0.0.1',r));

const env={MAILER_URL:`http://127.0.0.1:${api.address().port}`,MAILER_SECRET:secret,EMAIL_LINK_SECRET:'y'.repeat(40)};
const runtime={env,database:()=>db,workspaceAccess:async()=>({member:sql.prepare("SELECT * FROM members WHERE id='owner'").get(),user:{}})};
globalThis.emailTest=runtime;
async function load(p,names){let source=fs.readFileSync(p,'utf8').replace(/^import .*;\s*$/gm,'');source=`const {${names}}=globalThis.emailTest;\n`+source;return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'))}
const lib=await load('lib/email-campaigns.ts','env,workspaceAccess,database');Object.assign(runtime,lib);
const names='database,'+Object.keys(lib).join(',');
const email=await load('app/api/email/route.ts',names),messages=await load('app/api/email/messages/route.ts',names),hook=await load('app/api/email/webhook/route.ts',names);
// The mailer reports back to the portal webhook handler directly.
const events=createEventSender({config:mconfig,db:mdb,fetchFn:(url,init)=>hook.POST(new Request(url,init))});
const origin='https://portal.test';
const post=(path,body)=>new Request(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
const ok=async(r,status=200)=>{const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d};
async function settle(){for(let i=0;i<10;i++){worker.tick();await worker.idle()}await events.flush()}

// Connection check from Settings.
let status=await ok(await email.GET(new Request(origin+'/api/email?mailer=status')));assert.equal(status.connected,true);
await ok(await email.POST(post('/api/email',{action:'settings',from_name:'RA Studio',from_email:'hello@studio.test',reply_to:'',postal_address:'1 Gallery Road, Portland, OR 97201'})));

// Compose: To, Cc, Bcc.
const id=crypto.randomUUID();
await ok(await messages.POST(post('/api/email/messages',{action:'send',id,to:['alice@example.test'],cc:['bob@example.test'],bcc:['carol@other.test'],subject:'Studio visit',html:'<p>See you <b>Tuesday</b>.</p>'})));
await settle();
const toExample=received.find(r=>r.to.includes('alice@example.test'));
assert.deepEqual(toExample.to.sort(),['alice@example.test','bob@example.test']);
assert.ok(received.some(r=>r.to.includes('carol@other.test')));
assert.match(toExample.raw,/^From: "?RA Studio"? <hello@studio\.test>/m);assert.match(toExample.raw,/^Cc: bob@example\.test/m);assert.doesNotMatch(toExample.raw,/carol@other\.test/);
assert.match(toExample.raw,/^DKIM-Signature: .*d=studio\.test/m);
assert.equal(sql.prepare('SELECT status FROM email_messages WHERE id=?').get(id).status,'delivered');

// Campaign: one good address, one hard bounce, one opted out before sending.
const c=(await ok(await email.POST(post('/api/email',{action:'create',name:'Autumn'})))).id;
await ok(await email.POST(post('/api/email',{action:'update',campaign:c,revision:1,name:'Autumn',subject:'New work for {{name}}',html:'<p>Hello {{name}}</p>',text:''})));
await ok(await email.POST(post('/api/email',{action:'recipients',campaign:c,consent:true,recipients:[{email:'fan@example.test',name:'Fan'},{email:'reject@example.test',name:'Gone'},{email:'optout@example.test'}]})));
await ok(await email.POST(post('/api/email',{action:'suppress',emails:['optout@example.test']})));
await ok(await email.POST(post('/api/email',{action:'test',campaign:c,revision:2})));
await ok(await email.POST(post('/api/email',{action:'approve',campaign:c,revision:2,confirmCount:2})));
received.length=0;
const out=await ok(await email.POST(post('/api/email',{action:'dispatch',campaign:c})));assert.equal(out.state,'complete');
await settle();
const fan=received.find(r=>r.to.includes('fan@example.test'));
assert.match(fan.raw,/^Subject: New work for Fan/m);assert.match(fan.raw,/^List-Unsubscribe:\s+<https:\/\/portal\.test\/api\/email\/unsubscribe\?r=\d+&t=[\w-]+>/m);assert.match(fan.raw,/^List-Unsubscribe-Post: List-Unsubscribe=One-Click/m);
assert.ok(!received.some(r=>r.to.includes('optout@example.test')));
const detail=await ok(await email.GET(new Request(origin+'/api/email?campaign='+c)));
assert.deepEqual([detail.counts.delivered,detail.counts.bounced,detail.counts.suppressed],[1,1,1]);
assert.equal(sql.prepare("SELECT reason FROM email_suppressions WHERE email='reject@example.test'").get().reason,'bounce');

// Wrong shared secret is reported clearly.
env.MAILER_SECRET='z'.repeat(40);status=await ok(await email.GET(new Request(origin+'/api/email?mailer=status')));assert.equal(status.connected,false);assert.match(status.error,/MAILER_SECRET differs/);
await worker.stop();api.close();sink.close();
console.log('PASS: portal → own mailer → SMTP recipient server with no outside email service: connection check; composed To/Cc/Bcc mail delivered with DKIM and Bcc hidden; Sent status updated to delivered by signed report; campaign personalised with one-click unsubscribe; opted-out address never sent; hard bounce reported back and suppressed; mismatched secret explained.');
