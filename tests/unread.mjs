import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const slots=[],effects=[],intervals=new Set(),calls=[],links=[],periods=new Map();
let scroll=null,focused=true;
let index=0,props={memberId:'member-one',channel:'general',enabled:true,reading:true,snapshot:{channel:'general',seq:10}},result,nextResponse;
const document={title:'RA Studio — Team workspace',hidden:false,hasFocus:()=>focused,querySelector:()=>scroll,
 querySelectorAll:()=>links,head:{appendChild:n=>links.push(n)},addEventListener(){},removeEventListener(){},
 createElement:tag=>tag==='canvas'?{getContext:()=>({fillRect(){},beginPath(){},arc(){},fill(){},fillText(){}}),toDataURL:()=> 'data:image/png;base64,badge'}:{remove(){const i=links.indexOf(this);if(i>=0)links.splice(i,1);}}};
const react={useRef:v=>{const i=index++;return slots[i]??(slots[i]={current:v})},
 useState:v=>{const i=index++;if(!(i in slots))slots[i]=v;return [slots[i],v=>{slots[i]=v}]},
 useEffect:(fn,deps)=>{const i=index++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()}})}}};
let data={newestSeq:10,counts:{general:3,design:2},mentions:{general:1},alerts:[]};
let pings=0,gesture=false;const events=new Map(),saved=new Map();
class AudioContext {
 state='suspended';currentTime=0;destination={};
 async resume(){if(gesture)this.state='running'}async close(){this.state='closed'}
 createOscillator(){return {frequency:{},connect(){},start(){pings++},stop(){},disconnect(){}}}
 createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
}
const sandbox={exports:{},require:n=>n==='react'?react:{toast:Object.assign(()=>{},{error:()=>{}})},AbortController,Math,console,document,
 window:{AudioContext,localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},addEventListener:(k,v)=>events.set(k,v),removeEventListener:(k,v)=>{if(events.get(k)===v)events.delete(k)}},setInterval:(fn,ms)=>{intervals.add(fn);periods.set(ms,fn);return fn},clearInterval:fn=>intervals.delete(fn),
 fetch:async(url,options={})=>{calls.push({url,...options});if(nextResponse){const response=nextResponse;nextResponse=null;return await response;}return {ok:true,status:200,json:async()=>data}}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/use-unread.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
function render(){index=0;result=sandbox.exports.useUnread(props);while(effects.length)effects.shift()();}
async function settle(){await new Promise(r=>setImmediate(r));render();}
render();await settle();
assert.equal(result.total,5);assert.equal(document.title,'(5) RA Studio — Team workspace');assert.equal(links.length,1);assert.match(links[0].href,/^data:image\/png/);
assert.equal(calls.filter(c=>c.method==='POST').length,0,'Messages outside a visible chat must not be acknowledged');
assert.equal(intervals.size,3);
assert.equal(result.soundEnabled,true,'All members default to sound on');assert.equal(pings,0,'No startup chime or autoplay bypass');gesture=true;events.get('click')();await settle();assert.equal(pings,0,'Normal interaction unlocks quietly');
let resolve;nextResponse=new Promise(r=>resolve=r);periods.get(4000)();const inFlight=calls.at(-1);
for(let i=0;i<5;i++){props={...props,snapshot:{channel:'general',seq:11+i}};render();}
assert.equal(inFlight.signal.aborted,false,'Chat refresh must not cancel the notification request');assert.equal(intervals.size,3);
resolve({ok:true,status:200,json:async()=>({...data,newestSeq:11,counts:{general:4,design:2}})});await settle();assert.equal(result.total,6);assert.equal(pings,2,'New sequence plays one two-note ping');
document.hidden=true;periods.get(2000)();assert.match(document.title,/New messages/);periods.get(4000)();await settle();assert.equal(calls.filter(c=>c.method==='POST').length,0,'Background polling never marks messages read');
assert.equal(pings,2,'Repeated polls and older sequences do not repeat sound');await result.toggleSound();await settle();assert.equal(saved.get('commonroom-sound:member-one'),'off');events.get('click')();data={...data,newestSeq:12};periods.get(4000)();await settle();assert.equal(pings,2,'Muted incoming messages stay silent');
document.hidden=false;data={newestSeq:12,counts:{design:2},mentions:{},alerts:[]};await result.markRead();await settle();
const marked=calls.find(c=>c.method==='POST');assert.deepEqual(JSON.parse(marked.body),{channel:'general',through:15});assert.equal(result.total,2);
nextResponse=Promise.resolve({ok:false,status:503});periods.get(4000)();await settle();assert.match(result.error,/Retrying/);assert.equal(result.total,2,'Temporary failure retains existing badge');
data={newestSeq:0,counts:{},mentions:{},alerts:[]};periods.get(4000)();await settle();assert.equal(result.total,0);assert.equal(result.error,'');assert.equal(links.length,0);assert.equal(document.title,'RA Studio — Team workspace');
props={...props,enabled:false};render();await settle();assert.equal(intervals.size,0);
props={...props,enabled:true};render();await settle();assert.equal(result.soundEnabled,false,'Mute preference survives reinitialization');
scroll={scrollHeight:1000,scrollTop:0,clientHeight:300};props={...props,reading:true,snapshot:{channel:'general',seq:20}};render();
const before=calls.filter(c=>c.method==='POST').length;
periods.get(500)();await settle();assert.equal(calls.filter(c=>c.method==='POST').length,before,'Scrolled-up chat stays unread');
scroll.scrollTop=700;document.hidden=true;periods.get(500)();await settle();assert.equal(calls.filter(c=>c.method==='POST').length,before,'Hidden tab stays unread');
document.hidden=false;focused=false;periods.get(500)();await settle();assert.equal(calls.filter(c=>c.method==='POST').length,before,'Unfocused window stays unread');
focused=true;props={...props,reading:false};render();periods.get(500)();await settle();assert.equal(calls.filter(c=>c.method==='POST').length,before,'Other views/search do not mark chat read');
props={...props,reading:true};render();periods.get(500)();await settle();assert.equal(calls.filter(c=>c.method==='POST').length,before+1);assert.deepEqual(JSON.parse(calls.filter(c=>c.method==='POST').at(-1).body),{channel:'general',through:20});
periods.get(500)();await settle();assert.equal(calls.filter(c=>c.method==='POST').length,before+1,'Same rendered snapshot is acknowledged once');
props={...props,snapshot:{channel:'general',seq:21}};render();periods.get(500)();await settle();assert.equal(calls.filter(c=>c.method==='POST').length,before+2,'Newly displayed messages are acknowledged');
console.log('Unread hook: persistent badges, foreground/background polling, refresh races, automatic visible-chat acknowledgement and scroll/focus guards, favicon, default-on sound, gesture unlock, saved mute and deduplication, background tab title, recovery and cleanup passed.');

await result.toggleSound();await settle();const pingBeforeDirect=pings;data={newestSeq:0,counts:{},mentions:{},alerts:[],directSeq:42,directCounts:{privateThread:3}};periods.get(4000)();await settle();assert.equal(result.directTotal,3);assert.equal(result.channelTotal,0);assert.equal(result.total,3);assert.equal(pings,pingBeforeDirect+2);assert.match(document.title,/\(3\)/);data={...data,directCounts:{}};periods.get(4000)();await settle();assert.equal(result.total,0);console.log('PASS: private unread counts drive the shared tab badge and sound without changing channel counts.');
