// Synthetic check of the Compose screen API (To/Cc/Bcc one-off email) against a mocked Resend API. No real email is sent.
import fs from 'node:fs';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import ts from 'typescript';import crypto from 'node:crypto';
const sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>/^\d{4}_.*\.sql$/.test(f)).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
sql.exec("INSERT INTO members (id,user_id,email,name,role,status,created) VALUES ('owner','owner-user','owner@studio.test','Owner','owner','active',1),('member','member-user','m@studio.test','Member','member','active',1)");
const db={prepare(q){let args=[];return {bind(...v){args=v;return this},async first(){return sql.prepare(q).get(...args)??null},async all(){return {results:sql.prepare(q).all(...args)}},async run(){return {meta:sql.prepare(q).run(...args)}}}},async batch(st){sql.exec('BEGIN');try{const r=[];for(const s of st)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
const webhookKey=crypto.randomBytes(24);
const env={RESEND_API_KEY:'re_test_key_123456',EMAIL_LINK_SECRET:'x'.repeat(40),RESEND_WEBHOOK_SECRET:'whsec_'+webhookKey.toString('base64')};
let actor='owner';
const runtime={env,database:()=>db,workspaceAccess:async()=>{const m=sql.prepare('SELECT * FROM members WHERE id=?').get(actor);return m?{member:m,user:{}}:{response:Response.json({},{status:401})}}};
globalThis.emailTest=runtime;
async function load(p,names){let source=fs.readFileSync(p,'utf8').replace(/^import .*;\s*$/gm,'');source=`const {${names}}=globalThis.emailTest;\n`+source;return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'))}
const lib=await load('lib/email-campaigns.ts','env,workspaceAccess,database');Object.assign(runtime,lib);
const names='database,'+Object.keys(lib).join(',');
const settingsApi=await load('app/api/email/route.ts',names),api=await load('app/api/email/messages/route.ts',names),hook=await load('app/api/email/webhook/route.ts',names);
const calls=[],replays=new Map();let failNext=[],ids=0;
globalThis.fetch=async(url,init)=>{assert.equal(url,'https://api.resend.com/emails/batch');const key=init.headers['Idempotency-Key'],body=JSON.parse(init.body);
 if(replays.has(key)){calls.push({key,body,replay:true});return Response.json(replays.get(key))}
 calls.push({key,body});const fail=failNext.shift();if(fail)return Response.json({message:fail===422?'Invalid from address':'Busy'},{status:fail});
 const out={data:body.map(()=>({id:'re_'+(++ids)}))};replays.set(key,out);return Response.json(out)};
const origin='https://portal.test';
const req=(path,body,o=origin)=>new Request(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...(o?{Origin:o}:{})},body:JSON.stringify(body)});
const send=(body,o)=>api.POST(req('/api/email/messages',{action:'send',...body},o));
const ok=async(r,status=200)=>{const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d};
const id=()=>crypto.randomUUID();

// Sender must be set first; postal address is optional for composed mail.
await ok(await send({id:id(),to:['a@x.test'],subject:'Hi',html:'<p>Hi</p>'}),409);
await ok(await settingsApi.POST(req('/api/email',{action:'settings',from_name:'Rebecca at RA Studio',from_email:'rebecca@studio.test',reply_to:'',postal_address:''})));

// Access and origin.
actor='member';assert.equal((await send({id:id(),to:['a@x.test'],subject:'x',html:'x'})).status,403);assert.equal((await api.GET(new Request(origin+'/api/email/messages'))).status,403);actor='owner';
assert.equal((await send({id:id(),to:['a@x.test'],subject:'x',html:'x'},'https://evil.test')).status,403);

// Validation.
await ok(await send({id:'not-a-uuid',to:['a@x.test'],subject:'x',html:'x'}),400);
await ok(await send({id:id(),to:[],subject:'x',html:'x'}),400);
await ok(await send({id:id(),to:['bad@'],subject:'x',html:'x'}),400);
await ok(await send({id:id(),to:['a@x.test'],cc:['nope'],subject:'x',html:'x'}),400);
await ok(await send({id:id(),to:['a@x.test'],subject:'',html:'<div><br></div>'}),400);
await ok(await send({id:id(),to:Array.from({length:30},(_,i)=>`t${i}@x.test`),cc:Array.from({length:21},(_,i)=>`c${i}@x.test`),subject:'x',html:'x'}),400);
assert.equal(calls.length,0);

// Send with To, Cc and Bcc.
const first=id();
let d=await ok(await send({id:first,to:['Alice@Example.test','alice@example.test'],cc:['bob@example.test'],bcc:['carol@example.test'],subject:'Studio visit\nnext week',html:'<p>Hello <b>Alice</b>,</p><p>See you Tuesday.</p>'}));
assert.equal(d.status,'sent');assert.equal(calls.length,1);
const m=calls[0].body[0];assert.equal(calls[0].key,'direct:'+first);
assert.deepEqual([m.from,m.to,m.cc,m.bcc,m.subject],['Rebecca at RA Studio <rebecca@studio.test>',['alice@example.test'],['bob@example.test'],['carol@example.test'],'Studio visit next week']);
assert.match(m.html,/<b>Alice<\/b>/);assert.match(m.text,/Hello Alice,\s+See you Tuesday\./);assert.equal(m.headers,undefined);
// Double click / retry of the same message does not send twice.
d=await ok(await send({id:first,to:['alice@example.test'],subject:'Studio visit',html:'x'}));assert.equal(d.status,'sent');assert.equal(calls.length,1);

// A provider rejection is recorded; retrying the same message reuses its stored content and idempotency key.
const second=id();failNext=[503];
d=await ok(await send({id:second,to:['dave@example.test'],subject:'Quote',html:'<p>Attached quote</p>'}),502);assert.equal(d.status,'failed');
d=await ok(await send({id:second,to:['changed@example.test'],subject:'Changed',html:'changed'}));assert.equal(d.status,'sent');
assert.equal(calls.at(-1).key,'direct:'+second);assert.deepEqual(calls.at(-1).body[0].to,['dave@example.test']);
// An in-flight send is not duplicated; one stuck for over two minutes can be retried.
const third=id();sql.prepare("INSERT INTO email_messages (id,sender,from_address,to_list,cc_list,bcc_list,recipient_count,subject,html,text,status,created,updated) VALUES (?,'owner','x <rebecca@studio.test>','[\"e@example.test\"]','[]','[]',1,'s','<p>s</p>','s','sending',?,?)").run(third,Date.now(),Date.now());
await ok(await send({id:third,to:['e@example.test'],subject:'s',html:'s'}),409);
sql.prepare('UPDATE email_messages SET updated=0 WHERE id=?').run(third);await ok(await send({id:third,to:['e@example.test'],subject:'s',html:'s'}));

// Sent folder: newest first, search, detail with Cc/Bcc.
let list=await ok(await api.GET(new Request(origin+'/api/email/messages')));assert.equal(list.messages.length,3);assert.equal(list.messages[2].id,first);
list=await ok(await api.GET(new Request(origin+'/api/email/messages?q=bob@')));assert.deepEqual(list.messages.map(x=>x.id),[first]);
list=await ok(await api.GET(new Request(origin+'/api/email/messages?q=100%25')));assert.equal(list.messages.length,0);
const detail=await ok(await api.GET(new Request(origin+'/api/email/messages?id='+first)));assert.equal(JSON.parse(detail.message.bcc_list)[0],'carol@example.test');assert.equal(detail.message.subject,'Studio visit next week');

// Delivery webhook updates the Sent status.
const providerId=sql.prepare('SELECT provider_id FROM email_messages WHERE id=?').get(first).provider_id;
const body=JSON.stringify({type:'email.delivered',data:{email_id:providerId,to:['alice@example.test']}}),ts0=String(Math.floor(Date.now()/1000));
const sig='v1,'+crypto.createHmac('sha256',webhookKey).update(`msg_9.${ts0}.${body}`).digest('base64');
assert.equal((await hook.POST(new Request(origin+'/api/email/webhook',{method:'POST',headers:{'svix-id':'msg_9','svix-timestamp':ts0,'svix-signature':sig},body}))).status,200);
assert.equal(sql.prepare('SELECT status FROM email_messages WHERE id=?').get(first).status,'delivered');

// Daily cap keeps bulk mail in campaigns: 1,000 direct recipients per 24 hours.
let sent=4;while(sent+50<=1000){await ok(await send({id:id(),to:Array.from({length:50},(_,i)=>`bulk${sent+i}@example.test`),subject:'x',html:'x'}));sent+=50}
await ok(await send({id:id(),to:Array.from({length:50},(_,i)=>`over${i}@example.test`),subject:'x',html:'x'}),429);
delete env.RESEND_API_KEY;await ok(await send({id:id(),to:['z@example.test'],subject:'x',html:'x'}),503);
console.log('PASS: sender required; owner-only and origin checks; To/Cc/Bcc validation, dedupe and 50-address cap; From/To/Cc/Bcc/subject/text sent to provider; double-send protection; failed send retried with stored content and same idempotency key; stuck-send recovery; Sent list, search (LIKE-escaped) and detail; delivery webhook status; 1,000-per-day direct cap; missing provider key reported.');
