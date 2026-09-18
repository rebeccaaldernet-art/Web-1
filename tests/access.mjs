import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import assert from 'node:assert/strict';import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(root+'/drizzle/0000_special_mulholland_black.sql','utf8'));sql.exec(fs.readFileSync(root+'/drizzle/0001_new_thor.sql','utf8'));sql.exec(fs.readFileSync(root+'/drizzle/0002_oval_mysterio.sql','utf8'));
sql.prepare('INSERT INTO messages (id,channel,author,user_id,body,created) VALUES (?,?,?,?,?,?)').run('legacy-message','general','Existing Colleague','legacy-user','Earlier conversation',1);
sql.prepare('INSERT INTO messages (id,channel,author,user_id,body,created) VALUES (?,?,?,?,?,?)').run('legacy-message-2','general','Another Colleague','legacy-user-2','Earlier conversation',2);
sql.exec(fs.readFileSync(root+'/drizzle/0003_thick_silver_surfer.sql','utf8'));
sql.exec(fs.readFileSync(root+'/drizzle/0004_wakeful_killmonger.sql','utf8'));
sql.exec(fs.readFileSync(root+'/drizzle/0005_glorious_absorbing_man.sql','utf8'));
sql.exec(fs.readFileSync(root+'/drizzle/0006_bumpy_gateway.sql','utf8'));
sql.exec(fs.readFileSync(root+'/drizzle/0007_past_veda.sql','utf8'));
sql.exec(fs.readFileSync(root+'/drizzle/0008_ambitious_madelyne_pryor.sql','utf8'));
sql.exec(fs.readFileSync(root+'/drizzle/0009_wealthy_aaron_stack.sql','utf8'));
assert.equal(sql.prepare("SELECT COUNT(*) AS total FROM members WHERE email IS NULL").get().total,2);
assert.equal(sql.prepare("SELECT name FROM members WHERE user_id='legacy-user'").get().name,'Existing Colleague');
sql.exec("DELETE FROM messages WHERE id IN ('legacy-message','legacy-message-2')");

const db={prepare(q){let values=[];return {bind(...v){values=v;return this},async all(){return {results:sql.prepare(q).all(...values)}},async first(){return sql.prepare(q).get(...values)||null},async run(){return {meta:sql.prepare(q).run(...values)}}}},async batch(st){sql.exec('BEGIN');try{const r=await Promise.all(st.map(s=>s.run()));sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
const objects=new Map();const bucket={async put(id,stream){objects.set(id,await new Response(stream).arrayBuffer())},async get(id){const b=objects.get(id);return b?{body:b,size:b.byteLength}:null},async delete(id){objects.delete(id)}};
globalThis.testRuntime={database:()=>db,bucket:()=>bucket,user:{displayName:'Test Colleague',userId:'test-user'},async initChannels(){await db.prepare('INSERT OR IGNORE INTO channels (id,name,description,created) VALUES (?,?,?,?)').bind('general','general','Team conversation',0).run()}};
async function load(p){let source=fs.readFileSync(root+p,'utf8').replace(/^import .*;\s*$/gm,'');source='const {database,bucket,initChannels,workspaceAccess,effectivePermissions,permissionOptions,mentionDirectory,parseMentions,MAX_FILE_BYTES,UPLOAD_CHUNK_BYTES}=globalThis.testRuntime;const getChatGPTUser=async()=>{const u=globalThis.testRuntime.user;return u?{...u,email:u.email||u.userId+"@example.com"}:null};\n'+source;if(p==='/lib/access.ts')source=source.replace('initChannels,workspaceAccess','initChannels');if(p==='/lib/permissions.ts')source=source.replace(',effectivePermissions,permissionOptions','');if(p==='/lib/mentions.ts')source=source.replace(',mentionDirectory,parseMentions','');if(p==='/lib/transfers.ts')source=source.replace(',MAX_FILE_BYTES,UPLOAD_CHUNK_BYTES','');return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'))}
Object.assign(globalThis.testRuntime,await load('/lib/permissions.ts'));
Object.assign(globalThis.testRuntime,await load('/lib/mentions.ts'));Object.assign(globalThis.testRuntime,await load('/lib/transfers.ts'));
const accessCore=await load('/lib/access.ts');globalThis.testRuntime.workspaceAccess=accessCore.workspaceAccess;
const api=await load('/app/api/workspace/route.ts');const downloads=await load('/app/api/files/[id]/route.ts');
let r=await api.GET(new Request('https://test/api/workspace'));assert.equal(r.status,200);assert.equal((await r.json()).channels.length,1);
const f=new FormData();f.set('channel','general');f.set('body','Review this document');f.append('files',new File(['Team file contents'],'brief.txt',{type:'text/plain'}));r=await api.POST(new Request('https://test/api/workspace',{method:'POST',body:f}));assert.equal(r.status,200,await r.text());
r=await api.GET(new Request('https://test/api/workspace'));const state=await r.json();assert.equal(state.messages[0].body,'Review this document');assert.equal(state.files[0].name,'brief.txt');assert.equal(state.files[0].message_id,state.messages[0].id);
r=await downloads.GET(new Request('https://test/api/files/test'),{params:Promise.resolve({id:state.files[0].id})});assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/^attachment/);assert.equal(await r.text(),'Team file contents');
// Existing image attachments can be previewed without changing download behavior.
const previewParams={params:Promise.resolve({id:state.files[0].id})};
assert.equal((await downloads.GET(new Request('https://test/api/files/test?preview=1'),previewParams)).status,415);
sql.prepare('UPDATE files SET name=?,type=? WHERE id=?').run('photo.png','image/png',state.files[0].id);
r=await downloads.GET(new Request('https://test/api/files/test?preview=1'),previewParams);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.match(r.headers.get('content-disposition'),/^inline/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(await r.text(),'Team file contents');
sql.prepare('UPDATE files SET name=?,type=? WHERE id=?').run('vector.svg','image/svg+xml',state.files[0].id);
assert.equal((await downloads.GET(new Request('https://test/api/files/test?preview=1'),previewParams)).status,415);
sql.prepare('UPDATE files SET name=?,type=? WHERE id=?').run('brief.txt','text/plain',state.files[0].id);
r=await api.POST(new Request('https://test/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'New Project',description:'Our work'})}));assert.equal(r.status,200);assert.ok(sql.prepare("SELECT * FROM channels WHERE name='new-project'").get());
const empty=new FormData();empty.set('channel','general');r=await api.POST(new Request('https://test/api/workspace',{method:'POST',body:empty}));assert.equal(r.status,400);

const edits=await load('/app/api/messages/[id]/route.ts');
const params={params:Promise.resolve({id:state.messages[0].id})};
function editRequest(body){return new Request('https://test/api/messages/'+state.messages[0].id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({body})})}
const deleteRequest=new Request('https://test/api/messages/'+state.messages[0].id,{method:'DELETE'});
globalThis.testRuntime.user={displayName:'Other Colleague',userId:'other-user'};
assert.equal((await edits.PATCH(editRequest('Unauthorized change'),params)).status,403);
assert.equal((await edits.DELETE(deleteRequest,params)).status,403);
assert.equal(sql.prepare('SELECT body FROM messages WHERE id=?').get(state.messages[0].id).body,'Review this document');
globalThis.testRuntime.user={displayName:'Test Colleague',userId:'test-user'};
assert.equal((await edits.PATCH(editRequest('Updated message'),params)).status,200);
const updated=sql.prepare('SELECT * FROM messages WHERE id=?').get(state.messages[0].id);assert.equal(updated.body,'Updated message');assert.ok(updated.edited);
assert.equal(objects.size,1);assert.equal((await edits.PATCH(editRequest(''),params)).status,200);assert.equal((await edits.PATCH(editRequest('x'.repeat(10001)),params)).status,400);
await db.prepare('INSERT INTO messages (id,channel,author,user_id,body,created) VALUES (?,?,?,?,?,?)').bind('text-only','general','Test Colleague','test-user','Keep this text',Date.now()).run();
assert.equal((await edits.PATCH(editRequest(''),{params:Promise.resolve({id:'text-only'})})).status,400);
assert.equal((await edits.DELETE(deleteRequest,params)).status,200);assert.equal(objects.size,0);assert.equal(sql.prepare('SELECT * FROM messages WHERE id=?').get(state.messages[0].id),undefined);assert.equal(sql.prepare('SELECT * FROM files WHERE message_id=?').get(state.messages[0].id),undefined);
assert.equal((await downloads.GET(new Request('https://test/api/files/test'),{params:Promise.resolve({id:state.files[0].id})})).status,404);
assert.equal((await edits.PATCH(editRequest('Restore?'),params)).status,404);
globalThis.testRuntime.user=null;assert.equal((await edits.PATCH(editRequest('Signed out'),params)).status,401);assert.equal((await edits.DELETE(deleteRequest,params)).status,401);
console.log('PASS: original messaging and upload flow; edit persistence and timestamp; preserved attachments; empty-text validation; author-only edit/delete; removed message and file metadata/bytes; revoked downloads; signed-out protection.');

const access=await load('/app/api/access/route.ts');const analytics=await load('/app/api/analytics/route.ts');
const actor=(userId,email)=>globalThis.testRuntime.user={userId,email,displayName:email};
const mutate=body=>access.POST(new Request('https://test/api/access',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://test'},body:JSON.stringify(body)}));
const report=async()=>{const r=await access.GET();assert.equal(r.status,200);return r.json()};
const person=email=>sql.prepare('SELECT * FROM members WHERE email=?').get(email);
// Signing in first does not claim ownership.
actor('first-visitor','visitor@example.com');assert.equal((await report()).me.role,'member');
assert.equal((await mutate({action:'add',email:'bad@example.com',role:'admin'})).status,403);
assert.equal((await report()).members.length,0);
// Verified owner claims a permanent Site-specific identity.
actor('actual-owner','rebeccaaldernet@gmail.com');assert.equal((await report()).me.role,'owner');
assert.equal((await mutate({action:'add',email:'ADMIN@example.com',role:'admin'})).status,200);
assert.equal((await mutate({action:'add',email:'invalid',role:'member'})).status,400);
assert.equal((await mutate({action:'add',email:'bad@example.com',role:'owner'})).status,400);
assert.equal((await mutate({action:'role',id:'workspace-owner',role:'member'})).status,403);
assert.equal((await mutate({action:'remove',id:'workspace-owner'})).status,403);
assert.equal((await access.POST(new Request('https://test/api/access',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({action:'remove',id:person('visitor@example.com').id})}))).status,403);
actor('admin-id','admin@example.com');assert.equal((await report()).me.role,'admin');
assert.equal((await mutate({action:'add',email:'new@example.com',role:'member'})).status,200);
assert.equal((await mutate({action:'add',email:'escalation@example.com',role:'admin'})).status,403);
assert.equal((await mutate({action:'role',id:person('visitor@example.com').id,role:'admin'})).status,403);
assert.equal((await mutate({action:'approval',requireApproval:true})).status,403);
assert.equal((await mutate({action:'remove',id:'workspace-owner'})).status,403);
assert.equal((await mutate({action:'remove',id:person('admin@example.com').id})).status,403);
// Create a file as a member, revoke them, and verify every data endpoint.
actor('member-id','new@example.com');assert.equal((await report()).me.role,'member');
const posted=new FormData();posted.set('channel','general');posted.set('body','Saved before removal');posted.append('files',new File(['keep original'],'keep.txt'));
assert.equal((await api.POST(new Request('https://test/api/workspace',{method:'POST',body:posted}))).status,200);
const saved=sql.prepare("SELECT * FROM messages WHERE user_id='member-id'").get();const file=sql.prepare('SELECT * FROM files WHERE message_id=?').get(saved.id);
actor('admin-id','admin@example.com');assert.equal((await mutate({action:'remove',id:person('new@example.com').id})).status,200);
actor('member-id','new@example.com');assert.equal((await api.GET(new Request('https://test/api/workspace'))).status,403);assert.equal((await analytics.GET()).status,403);assert.equal((await access.GET()).status,403);
assert.equal((await api.POST(new Request('https://test/api/workspace',{method:'POST',body:posted}))).status,403);
assert.equal((await downloads.GET(new Request('https://test/api/files/'+file.id),{params:Promise.resolve({id:file.id})})).status,403);
assert.equal((await downloads.GET(new Request('https://test/api/files/'+file.id+'?preview=1'),{params:Promise.resolve({id:file.id})})).status,403);
assert.equal((await edits.PATCH(new Request('https://test/api/messages/'+saved.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'no'})}),{params:Promise.resolve({id:saved.id})})).status,403);
assert.equal((await edits.DELETE(new Request('https://test/api/messages/'+saved.id,{method:'DELETE'}),{params:Promise.resolve({id:saved.id})})).status,403);
assert.equal((await accessCore.membership(globalThis.testRuntime.user)).status,'removed');
actor('admin-id','admin@example.com');assert.equal((await mutate({action:'restore',id:person('new@example.com').id})).status,200);
actor('member-id','new@example.com');assert.equal((await downloads.GET(new Request('https://test/api/files/'+file.id),{params:Promise.resolve({id:file.id})})).status,200);
// Only owner can manage admins; restored admins become members.
actor('actual-owner','rebeccaaldernet@gmail.com');assert.equal((await mutate({action:'add',email:'admin2@example.com',role:'admin'})).status,200);
actor('admin-id','admin@example.com');assert.equal((await mutate({action:'remove',id:person('admin2@example.com').id})).status,403);
actor('actual-owner','rebeccaaldernet@gmail.com');assert.equal((await mutate({action:'role',id:person('admin@example.com').id,role:'member'})).status,200);
actor('admin-id','admin@example.com');assert.equal((await mutate({action:'add',email:'blocked@example.com'})).status,403);
actor('actual-owner','rebeccaaldernet@gmail.com');assert.equal((await mutate({action:'remove',id:person('admin2@example.com').id})).status,200);
assert.equal((await mutate({action:'restore',id:person('admin2@example.com').id})).status,200);assert.equal(person('admin2@example.com').role,'member');
assert.equal((await mutate({action:'approval',requireApproval:true})).status,200);
actor('pending-id','pending@example.com');assert.equal((await api.GET(new Request('https://test/api/workspace'))).status,403);assert.equal(person('pending@example.com').status,'pending');
actor('actual-owner','rebeccaaldernet@gmail.com');assert.equal((await mutate({action:'approve',id:person('pending@example.com').id})).status,200);
actor('pending-id','pending@example.com');assert.equal((await api.GET(new Request('https://test/api/workspace'))).status,200);
actor('actual-owner','rebeccaaldernet@gmail.com');assert.equal((await mutate({action:'add',email:'preapproved@example.com'})).status,200);
actor('preapproved','preapproved@example.com');assert.equal((await report()).me.status,'active');
globalThis.testRuntime.user=null;assert.equal((await access.GET()).status,401);assert.equal((await mutate({action:'add',email:'no@example.com'})).status,401);
console.log('PASS: owner protection; email grants bound to stable IDs; role escalation prevention; admin restrictions; removal across every API; restoration; pending approval; preapproved access; cross-origin protection.');

actor('actual-owner','rebeccaaldernet@gmail.com');
const imported=sql.prepare("SELECT * FROM members WHERE user_id='legacy-user'").get();
assert.equal((await mutate({action:'role',id:imported.id,role:'admin'})).status,200);
actor('legacy-user','legacy@example.com');assert.equal((await report()).me.role,'admin');assert.equal((await report()).me.email,'legacy@example.com');
actor('actual-owner','rebeccaaldernet@gmail.com');assert.equal((await mutate({action:'remove',id:imported.id})).status,200);
actor('legacy-user','legacy@example.com');assert.equal((await access.GET()).status,403);
console.log('PASS: existing participants imported with stable IDs, multiple unknown emails supported, promotion persists on sign-in, and removal blocks access.');

const defaults=globalThis.testRuntime.effectivePermissions({role:'member'});
actor('actual-owner','rebeccaaldernet@gmail.com');
const memberId=person('new@example.com').id;
const setRights=async overrides=>{actor('actual-owner','rebeccaaldernet@gmail.com');assert.equal((await mutate({action:'permissions',id:memberId,permissions:{...defaults,...overrides}})).status,200);actor('member-id','new@example.com');};
assert.equal((await mutate({action:'permissions',id:'workspace-owner',permissions:defaults})).status,403);
assert.equal((await mutate({action:'permissions',id:memberId,permissions:{unknown:true}})).status,400);
await setRights({readMessages:false,viewFiles:false,viewAnalytics:false,createChannels:false});
let restricted=await (await api.GET(new Request('https://test/api/workspace'))).json();assert.equal(restricted.messages.length,0);assert.equal(restricted.files.length,0);
assert.equal((await analytics.GET()).status,403);
assert.equal((await api.POST(new Request('https://test/api/workspace',{method:'POST',body:posted}))).status,403);
assert.equal((await downloads.GET(new Request('https://test/api/files/'+file.id),{params:Promise.resolve({id:file.id})})).status,403);
assert.equal((await downloads.GET(new Request('https://test/api/files/'+file.id+'?preview=1'),{params:Promise.resolve({id:file.id})})).status,403);
assert.equal((await api.POST(new Request('https://test/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'forbidden'})}))).status,403);
await setRights({uploadFiles:false,downloadFiles:false,editOwnMessages:false,deleteOwnMessages:false});
restricted=await (await api.GET(new Request('https://test/api/workspace'))).json();assert.ok(restricted.messages.length);assert.ok(restricted.files.length);
assert.equal((await api.POST(new Request('https://test/api/workspace',{method:'POST',body:posted}))).status,403);
assert.equal((await downloads.GET(new Request('https://test/api/files/'+file.id),{params:Promise.resolve({id:file.id})})).status,403);
assert.equal((await downloads.GET(new Request('https://test/api/files/'+file.id+'?preview=1'),{params:Promise.resolve({id:file.id})})).status,403);
assert.equal((await edits.PATCH(new Request('https://test/api/messages/'+saved.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'no'})}),{params:Promise.resolve({id:saved.id})})).status,403);
assert.equal((await edits.DELETE(new Request('https://test/api/messages/'+saved.id,{method:'DELETE'}),{params:Promise.resolve({id:saved.id})})).status,403);
const textOnly=new FormData();textOnly.set('channel','general');textOnly.set('body','Allowed text');assert.equal((await api.POST(new Request('https://test/api/workspace',{method:'POST',body:textOnly}))).status,200);
await setRights({manageMembers:true});
assert.ok((await report()).members.length);
assert.equal((await mutate({action:'add',email:'delegated@example.com'})).status,200);
assert.equal((await mutate({action:'permissions',id:memberId,permissions:defaults})).status,403);
assert.equal((await mutate({action:'role',id:person('delegated@example.com').id,role:'member'})).status,403);
assert.equal((await mutate({action:'add',email:'not-admin@example.com',role:'admin'})).status,403);
assert.equal((await mutate({action:'remove',id:'workspace-owner'})).status,403);
await setRights({manageMembers:false});assert.equal((await mutate({action:'add',email:'revoked@example.com'})).status,403);
console.log('PASS: granular rights enforced for chat reads/posts/edits/deletions, file visibility/uploads/downloads, channel creation, analytics, delegated member management, and owner-only assignments.');

const unread=await load('/app/api/unread/route.ts');
const counts=async()=>{const r=await unread.GET();assert.equal(r.status,200);return r.json()};
const mark=(channel,through)=>unread.POST(new Request('https://test/api/unread',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://test'},body:JSON.stringify({channel,through})}));
const post=async(channel,body)=>{const f=new FormData();f.set('channel',channel);f.set('body',body);const r=await api.POST(new Request('https://test/api/workspace',{method:'POST',body:f}));assert.equal(r.status,200);return (await r.json()).id};
// Start isolated notification assertions without touching live data.
sql.exec('DELETE FROM channel_reads; DELETE FROM message_notifications;');
await db.prepare('INSERT OR IGNORE INTO channels (id,name,description,created) VALUES (?,?,?,?)').bind('projects','projects','Project discussion',0).run();
actor('actual-owner','rebeccaaldernet@gmail.com');const n1=await post('general','New notification one');assert.equal((await counts()).total,0);
actor('member-id','new@example.com');assert.equal((await counts()).counts.general,1);
const before=await (await api.GET(new Request('https://test/api/workspace?channel=general'))).json();
actor('actual-owner','rebeccaaldernet@gmail.com');const n2=await post('general','Arrived after snapshot');await post('projects','Other channel');
actor('member-id','new@example.com');assert.equal((await mark('general',before.readThrough)).status,200);assert.deepEqual((await counts()).counts,{general:1,projects:1});
// Reads do not acknowledge messages and counts survive independent requests.
await api.GET(new Request('https://test/api/workspace?channel=general'));assert.equal((await counts()).total,2);
const newest=await (await api.GET(new Request('https://test/api/workspace?channel=general'))).json();assert.equal((await mark('general',newest.readThrough)).status,200);assert.equal((await counts()).total,1);
await mark('general',0);assert.equal((await counts()).total,1);
actor('pending-id','pending@example.com');assert.equal((await counts()).total,3);
actor('actual-owner','rebeccaaldernet@gmail.com');await edits.DELETE(new Request('https://test/api/messages/'+n2,{method:'DELETE'}),{params:Promise.resolve({id:n2})});
actor('pending-id','pending@example.com');assert.equal((await counts()).total,2);
assert.equal((await mark('general',-1)).status,400);assert.equal((await mark('missing-channel',1)).status,404);
assert.equal((await unread.POST(new Request('https://test/api/unread',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:JSON.stringify({channel:'general',through:999})}))).status,403);
await setRights({readMessages:false});assert.equal((await unread.GET()).status,403);assert.equal((await mark('general',1)).status,403);
globalThis.testRuntime.user=null;assert.equal((await unread.GET()).status,401);
console.log('PASS: per-member/per-channel unread counts; sender excluded; durable acknowledgements; snapshot race; monotonically increasing reads; deleted messages excluded; read permission and origin checks.');

// Mentions only resolve current active readers. User-facing handles contain no email leakage.
await setRights({});sql.exec('DELETE FROM channel_reads; DELETE FROM message_notifications;');
const mentionAPI=await load('/app/api/mentions/route.ts');
actor('actual-owner','rebeccaaldernet@gmail.com');const directory=await (await mentionAPI.GET()).json();const target=directory.members.find(p=>p.id===memberId);assert.ok(target);assert.equal(Object.keys(target).sort().join(','),'handle,id,name');
const tagMessage=await post('general','Hello @'+target.handle+' please review');
actor('member-id','new@example.com');let badge=await counts();assert.equal(badge.mentions.general,1);assert.equal(badge.alerts[0].id,tagMessage);
actor('pending-id','pending@example.com');badge=await counts();assert.equal(badge.mentions.general,0);
actor('actual-owner','rebeccaaldernet@gmail.com');const everyone=await post('general','@all new team update');
actor('pending-id','pending@example.com');assert.equal((await counts()).mentions.general,1);
actor('member-id','new@example.com');assert.equal((await counts()).mentions.general,2);
assert.equal((await globalThis.testRuntime.parseMentions('mail@all.com @allison')).all,false);
// Mock the actual R2 multipart interface, retaining real bytes for verification.
const multiparts=new Map();
bucket.head=async id=>objects.has(id)?{size:objects.get(id).byteLength}:null;
bucket.resumeMultipartUpload=(key,uploadId)=>({async uploadPart(partNumber,bytes){const record=multiparts.get(uploadId);if(!record||record.key!==key)throw Error('Missing multipart');record.parts.set(partNumber,new Uint8Array(bytes));return {partNumber,etag:'etag-'+partNumber}},async complete(parts){const record=multiparts.get(uploadId);if(!record)throw Error('Missing multipart');const chunks=parts.map(p=>record.parts.get(p.partNumber));if(chunks.some(p=>!p))throw Error('Missing part');const bytes=new Uint8Array(chunks.reduce((sum,p)=>sum+p.byteLength,0));let offset=0;for(const p of chunks){bytes.set(p,offset);offset+=p.byteLength;}objects.set(key,bytes.buffer);multiparts.delete(uploadId);return {size:bytes.byteLength}},async abort(){multiparts.delete(uploadId)}});
bucket.createMultipartUpload=async key=>{const uploadId=crypto.randomUUID();multiparts.set(uploadId,{key,parts:new Map()});return {uploadId,...bucket.resumeMultipartUpload(key,uploadId)}};
const uploadsAPI=await load('/app/api/uploads/route.ts');const partAPI=await load('/app/api/uploads/[id]/route.ts');
const initUpload=d=>uploadsAPI.POST(new Request('https://test/api/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}));
const batchId=crypto.randomUUID();const fileIds=[];const bytesTotal=26*1024*1024+17;const uploadId=crypto.randomUUID();
const description={id:uploadId,batch:batchId,channel:'general',name:'large-test.bin',size:bytesTotal,type:'application/octet-stream'};
let ur=await initUpload(description);assert.equal(ur.status,200);const init=await ur.json();assert.equal(init.chunkSize,8*1024*1024);
actor('pending-id','pending@example.com');assert.equal((await initUpload(description)).status,409);
assert.equal((await partAPI.PUT(new Request('https://test/api/uploads/'+uploadId+'?part=1',{method:'PUT',body:new Uint8Array(1),headers:{'Content-Length':'1'}}),{params:Promise.resolve({id:uploadId})})).status,404);
actor('member-id','new@example.com');let parts=[];
for(let offset=0;offset<bytesTotal;offset+=init.chunkSize){const b=new Uint8Array(Math.min(init.chunkSize,bytesTotal-offset));b.fill(parts.length+1);const part=await partAPI.PUT(new Request('https://test/api/uploads/'+uploadId+'?part='+(parts.length+1),{method:'PUT',headers:{'Content-Length':String(b.byteLength)},body:b}),{params:Promise.resolve({id:uploadId})});assert.equal(part.status,200);parts.push(await part.json());}
const complete=()=>partAPI.POST(new Request('https://test/api/uploads/'+uploadId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parts})}),{params:Promise.resolve({id:uploadId})});assert.equal((await complete()).status,200);assert.equal((await complete()).status,200);fileIds.push(uploadId);
// More than five files in one message, with total bytes above the previous 25 MiB cap.
for(let i=0;i<6;i++){const id=crypto.randomUUID();assert.equal((await initUpload({id,batch:batchId,channel:'general',name:'empty-'+i+'.txt',size:0,type:'text/plain'})).status,200);fileIds.push(id);}
const finalMessage=()=>{const f=new FormData();f.set('channel','general');f.set('body','Seven files');f.set('uploadBatch',batchId);f.set('fileCount','7');f.set('requestId',batchId);return api.POST(new Request('https://test/api/workspace',{method:'POST',body:f}));};
assert.equal((await finalMessage()).status,200);assert.equal((await finalMessage()).status,200);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM files WHERE message_id=?').get(batchId).n,7);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM messages WHERE id=?').get(batchId).n,1);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM upload_sessions WHERE batch=?').get(batchId).n,0);
const download=await downloads.GET(new Request('https://test/api/files/'+uploadId),{params:Promise.resolve({id:uploadId})});assert.equal(download.status,200);const content=new Uint8Array(await download.arrayBuffer());assert.equal(content.length,bytesTotal);assert.equal(content[0],1);assert.equal(content[init.chunkSize],2);
const cancelBatch=crypto.randomUUID(),cancelFile=crypto.randomUUID();assert.equal((await initUpload({id:cancelFile,batch:cancelBatch,channel:'general',name:'cancel.bin',size:10,type:''})).status,200);
assert.equal((await uploadsAPI.DELETE(new Request('https://test/api/uploads?batch='+cancelBatch,{method:'DELETE'}))).status,200);assert.equal(sql.prepare('SELECT id FROM upload_sessions WHERE id=?').get(cancelFile),undefined);
await setRights({uploadFiles:false});assert.equal((await initUpload({id:crypto.randomUUID(),batch:crypto.randomUUID(),channel:'general',name:'blocked.bin',size:10,type:''})).status,403);
console.log('PASS: individual and @all mention targeting; authenticated directory; multipart byte integrity; >25 MiB and seven-file message; idempotent finalization; upload ownership and permission guards; cancellation cleanup.');

// Replies preserve a validated quote and author, including selected text.
actor('test-user','test-user@example.com');
const originalId=crypto.randomUUID();sql.prepare('INSERT INTO messages(id,channel,author,user_id,body,created) VALUES(?,?,?,?,?,?)').run(originalId,'general','Original colleague','someone-else','Please review the blue version',Date.now());
const replyForm=new FormData();replyForm.set('channel','general');replyForm.set('body','Agreed 👍 https://example.com');replyForm.set('replyTo',originalId);replyForm.set('replyQuote','blue version');
let replyResponse=await api.POST(new Request('https://test/api/workspace',{method:'POST',body:replyForm}));assert.equal(replyResponse.status,200);const replyId=(await replyResponse.json()).id;const storedReply=sql.prepare('SELECT body,reply FROM messages WHERE id=?').get(replyId);assert.deepEqual(JSON.parse(storedReply.reply),{id:originalId,author:'Original colleague',quote:'blue version'});assert.equal(storedReply.body,'Agreed 👍 https://example.com');
replyForm.set('replyQuote','invented text');assert.equal((await api.POST(new Request('https://test/api/workspace',{method:'POST',body:replyForm}))).status,409);
replyForm.set('replyQuote','blue version');replyForm.set('channel','new-project');assert.equal((await api.POST(new Request('https://test/api/workspace',{method:'POST',body:replyForm}))).status>=400,true);
sql.prepare('DELETE FROM messages WHERE id=?').run(originalId);replyForm.set('channel','general');assert.equal((await api.POST(new Request('https://test/api/workspace',{method:'POST',body:replyForm}))).status,409);assert.equal(JSON.parse(sql.prepare('SELECT reply FROM messages WHERE id=?').get(replyId).reply).quote,'blue version');
console.log('PASS: selected-text reply persistence, emoji text, trusted authorship, invalid quotes, channel isolation and deleted original handling.');

const pinnedId=crypto.randomUUID();sql.prepare('INSERT INTO messages(id,channel,author,user_id,body,created) VALUES(?,?,?,?,?,?)').run(pinnedId,'general','Other colleague','other-user','Important older text',0);
const pinParams={params:Promise.resolve({id:pinnedId})};
const pinRequest=(pinned,origin='https://test')=>new Request('https://test/api/messages/'+pinnedId,{method:'PUT',headers:{'Content-Type':'application/json',origin},body:JSON.stringify({pinned})});
assert.equal((await edits.PUT(pinRequest(true),pinParams)).status,200);assert.equal(sql.prepare('SELECT pinned FROM messages WHERE id=?').get(pinnedId).pinned,1);
for(let i=0;i<201;i++)sql.prepare('INSERT INTO messages(id,channel,author,user_id,body,created) VALUES(?,?,?,?,?,?)').run('newer-'+i,'general','Other colleague','other-user','Recent message',100+i);
let pinWorkspace=await (await api.GET(new Request('https://test/api/workspace?channel=general'))).json();assert.ok(!pinWorkspace.messages.some(m=>m.id===pinnedId));assert.ok(pinWorkspace.pinnedMessages.some(m=>m.id===pinnedId),'Older pins stay available beyond the latest 200 messages');
assert.equal((await edits.PUT(pinRequest('yes'),pinParams)).status,400);assert.equal((await edits.PUT(pinRequest(false,'https://elsewhere.test'),pinParams)).status,403);
assert.equal((await edits.PUT(pinRequest(false),pinParams)).status,200);pinWorkspace=await (await api.GET(new Request('https://test/api/workspace?channel=general'))).json();assert.ok(!pinWorkspace.pinnedMessages.some(m=>m.id===pinnedId));
const restoreUser=globalThis.testRuntime.user;globalThis.testRuntime.user=null;assert.equal((await edits.PUT(pinRequest(true),pinParams)).status,401);globalThis.testRuntime.user=restoreUser;
sql.prepare('UPDATE members SET permissions=? WHERE user_id=?').run(JSON.stringify({sendMessages:false}),restoreUser.userId);assert.equal((await edits.PUT(pinRequest(true),pinParams)).status,403);
console.log('PASS: shared pin/unpin persistence, old pinned messages, invalid payload, cross-origin and signed-out/read-only guards.');
// Ownership transfer requires a verified active recipient and changes both roles atomically.
actor('actual-owner','rebeccaaldernet@gmail.com');
assert.equal((await mutate({action:'add',email:'next-owner@example.com',role:'member'})).status,200);
const transferId=person('next-owner@example.com').id;
const transfer={action:'transferOwnership',id:transferId,confirmEmail:'next-owner@example.com'};
assert.equal((await mutate(transfer)).status,409); // never-signed-in email grant
actor('next-owner-id','next-owner@example.com');await report();
sql.prepare("UPDATE members SET status='active' WHERE id=?").run(transferId);
assert.equal((await mutate({action:'transferOwnership',id:'workspace-owner',confirmEmail:'rebeccaaldernet@gmail.com'})).status,403);
actor('actual-owner','rebeccaaldernet@gmail.com');
assert.equal((await mutate({...transfer,confirmEmail:'wrong@example.com'})).status,409);
sql.prepare("UPDATE members SET status='removed' WHERE id=?").run(transferId);
assert.equal((await mutate(transfer)).status,409);
sql.prepare("UPDATE members SET status='active' WHERE id=?").run(transferId);
assert.equal((await access.POST(new Request('https://test/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(transfer)}))).status,403);
assert.equal((await mutate({...transfer,id:'workspace-owner'})).status,400);
assert.equal((await mutate(transfer)).status,200);
assert.equal(person('next-owner@example.com').role,'owner');assert.equal(person('rebeccaaldernet@gmail.com').role,'admin');
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM members WHERE role='owner'").get().n,1);
assert.equal((await mutate(transfer)).status,403); // replay by former owner
actor('next-owner-id','next-owner@example.com');assert.equal((await report()).me.role,'owner');
console.log('PASS ownership: active signed-in recipient, email confirmation, CSRF, owner-only, atomic role swap, replay denial.');
