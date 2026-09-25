'use client';
import {useCallback,useEffect,useState} from 'react';
import {toast} from 'sonner';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
export type EmailSettingsValue={from_name:string;from_email:string;reply_to:string;postal_address:string};
type Overview={settings:EmailSettingsValue|null;suppressed:number;readiness:{provider:boolean;links:boolean};audit:{action:string;campaign:string;detail:string;created:number}[]};
type MailerStatus={connected:boolean;error?:string;stats?:{today:number;dailyCap:number;deliveries:Record<string,number>}};
const empty:EmailSettingsValue={from_name:'',from_email:'',reply_to:'',postal_address:''};
const label='block text-sm font-medium mb-1';
const n=(v?:number)=>(v||0).toLocaleString();
async function post(d:unknown){const r=await fetch('/api/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const out=await r.json().catch(()=>({})) as {error?:string;added?:number};if(!r.ok)throw Error(out.error||'Request failed.');return out}
export default function EmailSettings({onSaved}:{onSaved:()=>void}){
 const [status,setStatus]=useState<MailerStatus|null>(null),[checking,setChecking]=useState(false);
 const [overview,setOverview]=useState<Overview|null>(null),[settings,setSettings]=useState(empty),[suppress,setSuppress]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/email',{cache:'no-store'});const d=await r.json() as Overview&{error?:string};if(!r.ok)throw Error(d.error);setOverview(d);setSettings(d.settings||empty);setError('')}catch(e){setError(e instanceof Error&&e.message?e.message:'Email settings could not load.')}},[]);
 useEffect(()=>{const t=setTimeout(()=>void load());return()=>clearTimeout(t)},[load]);
 async function check(){setChecking(true);try{const r=await fetch('/api/email?mailer=status',{cache:'no-store'});setStatus(await r.json() as MailerStatus)}catch{setStatus({connected:false,error:'Could not check the mail server.'})}finally{setChecking(false)}}
 async function run(task:()=>Promise<void>){setBusy(true);try{await task()}catch(e){toast.error(e instanceof Error?e.message:'Something went wrong.')}finally{setBusy(false)}}
 if(error)return <div className="error-banner" role="alert">{error}<button onClick={()=>void load()}>Try again</button></div>;
 if(!overview)return <p>Loading…</p>;
 const ready=overview.readiness;
 return <section>
  <h1>Email settings</h1>
  <div className="tool-card"><div className="tool-title"><h2>Your mail server</h2><button className="outline-button" disabled={checking} onClick={()=>void check()}>{checking?'Checking…':'Check connection'}</button></div>
   <p className="text-sm">Email is delivered by your own mail server (the <code>mailer/</code> service in this project), not by an outside email company.</p>
   <ul className="list-disc pl-5 text-sm space-y-1 mt-2">
   <li>{ready.provider?'✓':'✗'} <code>MAILER_URL</code> and <code>MAILER_SECRET</code>: the HTTPS address of your mail server and the shared secret (the same 32+ character value on both sides). Required to send anything.</li>
   <li>{ready.links?'✓':'✗'} <code>EMAIL_LINK_SECRET</code>: at least 32 random characters, used to sign unsubscribe links. Required for campaigns.</li></ul>
   {status&&(status.connected?<div className="mt-3 text-sm"><strong>✓ Connected.</strong> Today: {n(status.stats?.today)} of {n(status.stats?.dailyCap)} recipients (daily warm-up limit) · Waiting: {n((status.stats?.deliveries?.queued||0)+(status.stats?.deliveries?.deferred||0))} · Delivered: {n(status.stats?.deliveries?.sent)} · Bounced: {n(status.stats?.deliveries?.bounced)} · Failed: {n(status.stats?.deliveries?.failed)}</div>:<div className="error-banner mt-3" role="alert">{status.error}</div>)}</div>
  <div className="tool-card"><h2>Sender</h2><p className="text-sm">Used for every email you compose and every campaign.</p><div className="grid gap-3 sm:grid-cols-2 mt-3">
   <label><span className={label}>From name</span><Input value={settings.from_name} onChange={e=>setSettings({...settings,from_name:e.target.value})}/></label>
   <label><span className={label}>From address (a domain your mail server signs)</span><Input type="email" value={settings.from_email} onChange={e=>setSettings({...settings,from_email:e.target.value})}/></label>
   <label><span className={label}>Reply-to (optional)</span><Input type="email" value={settings.reply_to} onChange={e=>setSettings({...settings,reply_to:e.target.value})}/></label>
   <label><span className={label}>Postal address (required for campaigns)</span><Textarea rows={2} value={settings.postal_address} onChange={e=>setSettings({...settings,postal_address:e.target.value})}/></label></div>
   <div className="scan-actions mt-3"><button className="solid-button" disabled={busy} onClick={()=>run(async()=>{await post({action:'settings',...settings});toast.success('Sender saved');await load();onSaved()})}>Save sender</button></div></div>
  <div className="tool-card"><h2>Suppression list</h2><p className="text-sm">Campaigns never email these {n(overview.suppressed)} addresses (unsubscribes, hard bounces, complaints and addresses you add here).</p>
   <Textarea className="mt-2" rows={3} placeholder="One email address per line" value={suppress} onChange={e=>setSuppress(e.target.value)}/>
   <div className="scan-actions mt-2"><button className="outline-button" disabled={!suppress.trim()||busy} onClick={()=>run(async()=>{const d=await post({action:'suppress',emails:suppress.split(/[\s,;]+/).filter(Boolean)});toast.success(`${n(d.added)} addresses suppressed`);setSuppress('');await load()})}>Add to suppression list</button></div></div>
  {overview.audit.length>0&&<div className="tool-card"><h2>Activity</h2><ul className="text-sm mt-2 space-y-1">{overview.audit.slice(0,20).map((x,i)=><li key={i}>{new Date(x.created).toLocaleString()} · {x.action}{x.detail?` · ${x.detail}`:''}</li>)}</ul></div>}
 </section>;
}
