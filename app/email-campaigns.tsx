'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Papa from 'papaparse';
import {toast} from 'sonner';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
type Settings={from_name:string;from_email:string;reply_to:string;postal_address:string};
type Summary={id:string;name:string;subject:string;state:string;revision:number;tested_revision:number;created:number;updated:number};
type Campaign=Summary&{html:string;text:string};
type Overview={settings:Settings|null;campaigns:Summary[];suppressed:number;readiness:{provider:boolean;links:boolean};limits:{recipientsPerCampaign:number;recipientsPerUpload:number};ownerEmail:string|null;audit:{action:string;campaign:string;detail:string;created:number}[]};
type Detail={campaign:Campaign;counts:Record<string,number>;failures:{email:string;error:string}[]};
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API responses are typed at each call site
async function response(r:Response):Promise<any>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error((d as {error?:string}).error||'Request failed.');return d}
const post=(d:unknown)=>fetch('/api/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(response);
const n=(v?:number)=>(v||0).toLocaleString();
const label='block text-sm font-medium mb-1';
export default function EmailCampaigns(){
 const [overview,setOverview]=useState<Overview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [newName,setNewName]=useState('');
 const [selected,setSelected]=useState(''),[detail,setDetail]=useState<Detail|null>(null),[draft,setDraft]=useState({name:'',subject:'',html:'',text:''});
 const [consent,setConsent]=useState(false),[upload,setUpload]=useState(''),[confirm,setConfirm]=useState(''),[preview,setPreview]=useState(false);
 const [autoSend,setAutoSend]=useState(true);const sending=useRef(false);
 const load=useCallback(async()=>{try{const d:Overview=await fetch('/api/email',{cache:'no-store'}).then(response);setError('');setOverview(d)}catch(e){setError(e instanceof Error?e.message:'Could not load campaigns.')}},[]);
 const loadDetail=useCallback(async(id:string,resetDraft=true)=>{try{const d:Detail=await fetch('/api/email?campaign='+encodeURIComponent(id),{cache:'no-store'}).then(response);setDetail(d);if(resetDraft)setDraft({name:d.campaign.name,subject:d.campaign.subject,html:d.campaign.html,text:d.campaign.text})}catch(e){toast.error(e instanceof Error?e.message:'Could not load campaign.')}},[]);
 useEffect(()=>{const t=setTimeout(()=>void load());return()=>clearTimeout(t)},[load]);
 function choose(id:string){setSelected(id);setConsent(false);setConfirm('');setPreview(false);void loadDetail(id)}
 async function run(name:string,task:()=>Promise<void>){setBusy(name);try{await task()}catch(e){toast.error(e instanceof Error?e.message:'Something went wrong.')}finally{setBusy('')}}
 const c=detail?.campaign,counts=detail?.counts||{},dirty=!!c&&(draft.name!==c.name||draft.subject!==c.subject||draft.html!==c.html||draft.text!==c.text);
 const total=Object.values(counts).reduce((a,b)=>a+b,0),done=total-(counts.queued||0)-(counts.sending||0);
 // Keep sending while this page is open. Each call sends up to 500 messages; the server resumes safely after interruptions.
 const campaignId=c?.id,campaignState=c?.state;
 useEffect(()=>{if(!campaignId||campaignState!=='sending'||!autoSend)return;let stopped=false;
  (async()=>{if(sending.current)return;sending.current=true;try{while(!stopped){const d=await post({action:'dispatch',campaign:campaignId});setDetail(x=>x&&x.campaign.id===campaignId?{...x,counts:d.counts,campaign:{...x.campaign,state:d.state}}:x);if(d.state!=='sending')break;if(d.warning)toast.warning(d.warning);await new Promise(r=>setTimeout(r,d.sent?300:d.warning?15000:5000))}}catch(e){toast.error(e instanceof Error?e.message:'Sending paused.');setAutoSend(false)}finally{sending.current=false;void load()}})();
  return()=>{stopped=true}},[campaignId,campaignState,autoSend,load]);
 function importCsv(file:File){if(!c)return;if(!consent){toast.error('Confirm opt-in consent first.');return}
  setUpload('Reading file…');
  Papa.parse<Record<string,string>>(file,{header:true,skipEmptyLines:true,complete:async result=>{
   const fields=result.meta.fields||[],emailKey=fields.find(f=>/^e-?mail( address)?$/i.test(f.trim())),nameKey=fields.find(f=>/^(name|full name|first name)$/i.test(f.trim()));
   if(!emailKey){setUpload('');toast.error('The CSV needs an "email" column.');return}
   const rows=result.data.map(r=>({email:r[emailKey]||'',name:nameKey?r[nameKey]||'':''}));const size=overview?.limits.recipientsPerUpload||1000;
   let added=0,duplicates=0,invalid=0;
   try{for(let i=0;i<rows.length;i+=size){setUpload(`Uploading ${n(Math.min(i+size,rows.length))} of ${n(rows.length)}…`);const d=await post({action:'recipients',campaign:c.id,consent:true,recipients:rows.slice(i,i+size)});added+=d.added;duplicates+=d.duplicates;invalid+=d.invalid}
    toast.success(`${n(added)} recipients added. ${n(duplicates)} duplicates and ${n(invalid)} invalid addresses skipped.`)}
   catch(e){toast.error((e instanceof Error?e.message:'Upload stopped.')+` ${n(added)} were added before it stopped.`)}
   finally{setUpload('');void loadDetail(c.id,false)}},error:()=>{setUpload('');toast.error('The file could not be read as CSV.')}})}
 if(error)return <section><h1>Campaigns</h1><div className="error-banner" role="alert">{error}<button onClick={()=>void load()}>Try again</button></div></section>;
 if(!overview)return <section><h1>Campaigns</h1><p>Loading…</p></section>;
 const ready=overview.readiness,senderReady=!!overview.settings?.from_email&&(overview.settings?.postal_address||'').trim().length>=10;
 return <section>
  <div className="tool-title"><h1>Campaigns</h1><button className="outline-button" onClick={()=>{void load();if(selected)void loadDetail(selected,!dirty)}}>Refresh</button></div>
  <p className="tool-intro">Send bulk email to people who opted in. Messages go out through your own mail server, include a one-click unsubscribe link and your postal address, and skip anyone who unsubscribed, bounced or complained.</p>
  {(!senderReady||!ready.provider||!ready.links)&&<div className="error-banner" role="status">Campaigns need a sender with a postal address and the email provider secrets. Finish setup in Email settings.</div>}
  <div className="tool-card"><h2>Campaigns</h2>
   <form className="flex gap-2 mt-3 flex-wrap" onSubmit={e=>{e.preventDefault();void run('create',async()=>{const d=await post({action:'create',name:newName});setNewName('');await load();choose(d.id)})}}><Input className="max-w-sm" placeholder="Campaign name" value={newName} onChange={e=>setNewName(e.target.value)}/><button className="solid-button" disabled={!newName.trim()||!!busy}>New campaign</button></form>
   {overview.campaigns.length?<div className="orders-table mt-3"><table><thead><tr><th>Campaign</th><th>Subject</th><th>Status</th><th>Created</th></tr></thead><tbody>{overview.campaigns.map(x=><tr key={x.id} className={x.id===selected?'font-semibold':''}><td><button className="underline" onClick={()=>choose(x.id)}>{x.name}</button></td><td>{x.subject||'—'}</td><td>{x.state}</td><td>{new Date(x.created).toLocaleDateString()}</td></tr>)}</tbody></table></div>:<p className="mt-3">No campaigns yet.</p>}</div>
  {c&&<div className="tool-card"><div className="tool-title"><h2>{c.name}</h2><span className="text-sm">Status: <strong>{c.state}</strong></span></div>
   {c.state==='draft'?<div className="grid gap-3 mt-3">
    <label><span className={label}>Campaign name</span><Input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <label><span className={label}>Subject</span><Input value={draft.subject} maxLength={200} onChange={e=>setDraft({...draft,subject:e.target.value})}/></label>
    <label><span className={label}>HTML body — merge fields: {'{{name}}'}, {'{{email}}'}. The unsubscribe footer is added automatically.</span><Textarea rows={10} className="font-mono text-xs" value={draft.html} onChange={e=>setDraft({...draft,html:e.target.value})}/></label>
    <label><span className={label}>Plain-text version (optional; generated from HTML when empty)</span><Textarea rows={4} value={draft.text} onChange={e=>setDraft({...draft,text:e.target.value})}/></label>
    <div className="scan-actions"><button className="solid-button" disabled={!dirty||!!busy} onClick={()=>run('save',async()=>{await post({action:'update',campaign:c.id,revision:c.revision,...draft});toast.success('Draft saved');await loadDetail(c.id);await load()})}>Save draft</button><button className="outline-button" onClick={()=>setPreview(!preview)}>{preview?'Hide preview':'Preview'}</button></div>
    {preview&&<iframe title="Email preview" sandbox="" className="w-full h-96 border rounded" srcDoc={draft.html}/>}
   </div>:<p className="mt-2 text-sm">Subject: {c.subject}</p>}
   <h3 className="mt-5 font-semibold">Recipients</h3>
   <p className="text-sm">{n(total)} total · {n(counts.queued)} queued · {n((counts.sent||0)+(counts.delivered||0))} handed to your mail server · {n(counts.delivered)} accepted by recipients · {n(counts.suppressed)} suppressed · {n((counts.bounced||0)+(counts.complained||0))} bounced/complained · {n(counts.failed)} failed{counts.cancelled?` · ${n(counts.cancelled)} cancelled`:''}</p>
   {c.state!=='draft'&&total>0&&<div className="h-2 bg-gray-200 rounded mt-2" role="progressbar" aria-valuenow={Math.round(done/total*100)} aria-valuemin={0} aria-valuemax={100}><div className="h-2 bg-green-700 rounded" style={{width:`${done/total*100}%`}}/></div>}
   {c.state==='draft'&&<div className="mt-3 grid gap-2">
    <label className="flex gap-2 items-start text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I confirm every address in this file opted in to receive email from {overview.settings?.from_name||'us'}, and the list was not purchased or scraped.</span></label>
    <div className="scan-actions"><label className={'outline-button'+(consent&&!upload?'':' opacity-50 pointer-events-none')}>Upload CSV (email, name)<input type="file" accept=".csv,text/csv" className="hidden" disabled={!consent||!!upload} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)importCsv(f)}}/></label>
     {total>0&&<button className="outline-button" disabled={!!busy||!!upload} onClick={()=>{if(window.confirm(`Remove all ${n(total)} recipients from this draft?`))void run('clear',async()=>{await post({action:'clearRecipients',campaign:c.id});await loadDetail(c.id,false)})}}>Clear recipients</button>}{upload&&<span className="text-sm">{upload}</span>}</div></div>}
   {c.state==='draft'&&<><h3 className="mt-5 font-semibold">Test and send</h3>
    <p className="text-sm">A test of the saved version goes to {overview.ownerEmail||'your account email'}. Sending is unlocked only after a successful test of the current version.</p>
    <div className="scan-actions mt-2"><button className="outline-button" disabled={dirty||!!busy} onClick={()=>run('test',async()=>{const d=await post({action:'test',campaign:c.id,revision:c.revision});toast.success('Test sent to '+d.to);await loadDetail(c.id,false)})}>{busy==='test'?'Sending test…':'Send test to me'}</button>{c.tested_revision===c.revision&&!dirty&&<span className="text-sm">✓ Tested</span>}</div>
    {c.tested_revision===c.revision&&!dirty&&counts.queued>0&&<div className="mt-3 grid gap-2 max-w-md"><label><span className={label}>Type {counts.queued} to confirm sending to {n(counts.queued)} recipients</span><Input inputMode="numeric" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
     <button className="solid-button" disabled={Number(confirm)!==counts.queued||!!busy} onClick={()=>run('approve',async()=>{await post({action:'approve',campaign:c.id,revision:c.revision,confirmCount:Number(confirm)});toast.success('Sending started');setAutoSend(true);await loadDetail(c.id,false);await load()})}>Start sending</button></div>}</>}
   {(c.state==='sending'||c.state==='paused')&&<div className="scan-actions mt-3">
    {c.state==='sending'&&<button className="outline-button" disabled={!!busy} onClick={()=>run('pause',async()=>{await post({action:'pause',campaign:c.id});await loadDetail(c.id,false)})}>Pause</button>}
    {c.state==='paused'&&<button className="solid-button" disabled={!!busy} onClick={()=>run('resume',async()=>{await post({action:'resume',campaign:c.id});setAutoSend(true);await loadDetail(c.id,false)})}>Resume</button>}
    {c.state==='sending'&&!autoSend&&<button className="solid-button" onClick={()=>setAutoSend(true)}>Continue sending</button>}
    <span className="text-sm">{c.state==='sending'?'Keep this page open while sending. Closing it pauses progress; reopen to continue.':'Paused.'}</span></div>}
   {['draft','sending','paused'].includes(c.state)&&<button className="outline-button mt-4" disabled={!!busy} onClick={()=>{if(window.confirm('Cancel this campaign? Unsent recipients will not be emailed.'))void run('cancel',async()=>{await post({action:'cancel',campaign:c.id});await loadDetail(c.id,false);await load()})}}>Cancel campaign</button>}
   {detail!.failures.length>0&&<><h3 className="mt-5 font-semibold">Recent failures</h3><ul className="text-sm list-disc pl-5">{detail!.failures.map(f=><li key={f.email}>{f.email}: {f.error}</li>)}</ul></>}
  </div>}
 </section>;
}
