'use client';
import {useCallback,useEffect,useState} from 'react';
import {toast} from 'sonner';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
export type EmailSettingsValue={from_name:string;from_email:string;reply_to:string;postal_address:string};
type Overview={settings:EmailSettingsValue|null;suppressed:number;readiness:{provider:boolean;links:boolean;webhook:boolean};audit:{action:string;campaign:string;detail:string;created:number}[]};
const empty:EmailSettingsValue={from_name:'',from_email:'',reply_to:'',postal_address:''};
const label='block text-sm font-medium mb-1';
const n=(v?:number)=>(v||0).toLocaleString();
async function post(d:unknown){const r=await fetch('/api/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const out=await r.json().catch(()=>({})) as {error?:string;added?:number};if(!r.ok)throw Error(out.error||'Request failed.');return out}
export default function EmailSettings({onSaved}:{onSaved:()=>void}){
 const [overview,setOverview]=useState<Overview|null>(null),[settings,setSettings]=useState(empty),[suppress,setSuppress]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/email',{cache:'no-store'});const d=await r.json() as Overview&{error?:string};if(!r.ok)throw Error(d.error);setOverview(d);setSettings(d.settings||empty);setError('')}catch(e){setError(e instanceof Error&&e.message?e.message:'Email settings could not load.')}},[]);
 useEffect(()=>{const t=setTimeout(()=>void load());return()=>clearTimeout(t)},[load]);
 async function run(task:()=>Promise<void>){setBusy(true);try{await task()}catch(e){toast.error(e instanceof Error?e.message:'Something went wrong.')}finally{setBusy(false)}}
 if(error)return <div className="error-banner" role="alert">{error}<button onClick={()=>void load()}>Try again</button></div>;
 if(!overview)return <p>Loading…</p>;
 const ready=overview.readiness;
 return <section>
  <h1>Email settings</h1>
  <div className="tool-card"><h2>Deployment setup</h2><ul className="list-disc pl-5 text-sm space-y-1 mt-2">
   <li>{ready.provider?'✓':'✗'} <code>RESEND_API_KEY</code>: Worker secret from a Resend account with a verified sending domain (SPF, DKIM and DMARC). Required to send anything.</li>
   <li>{ready.links?'✓':'✗'} <code>EMAIL_LINK_SECRET</code>: at least 32 random characters, used to sign unsubscribe links. Required for campaigns.</li>
   <li>{ready.webhook?'✓':'✗'} <code>RESEND_WEBHOOK_SECRET</code> (whsec_…): webhook at <code>/api/email/webhook</code> that records deliveries, bounces and complaints.</li></ul></div>
  <div className="tool-card"><h2>Sender</h2><p className="text-sm">Used for every email you compose and every campaign.</p><div className="grid gap-3 sm:grid-cols-2 mt-3">
   <label><span className={label}>From name</span><Input value={settings.from_name} onChange={e=>setSettings({...settings,from_name:e.target.value})}/></label>
   <label><span className={label}>From address (on your verified domain)</span><Input type="email" value={settings.from_email} onChange={e=>setSettings({...settings,from_email:e.target.value})}/></label>
   <label><span className={label}>Reply-to (optional)</span><Input type="email" value={settings.reply_to} onChange={e=>setSettings({...settings,reply_to:e.target.value})}/></label>
   <label><span className={label}>Postal address (required for campaigns)</span><Textarea rows={2} value={settings.postal_address} onChange={e=>setSettings({...settings,postal_address:e.target.value})}/></label></div>
   <div className="scan-actions mt-3"><button className="solid-button" disabled={busy} onClick={()=>run(async()=>{await post({action:'settings',...settings});toast.success('Sender saved');await load();onSaved()})}>Save sender</button></div></div>
  <div className="tool-card"><h2>Suppression list</h2><p className="text-sm">Campaigns never email these {n(overview.suppressed)} addresses (unsubscribes, hard bounces, complaints and addresses you add here).</p>
   <Textarea className="mt-2" rows={3} placeholder="One email address per line" value={suppress} onChange={e=>setSuppress(e.target.value)}/>
   <div className="scan-actions mt-2"><button className="outline-button" disabled={!suppress.trim()||busy} onClick={()=>run(async()=>{const d=await post({action:'suppress',emails:suppress.split(/[\s,;]+/).filter(Boolean)});toast.success(`${n(d.added)} addresses suppressed`);setSuppress('');await load()})}>Add to suppression list</button></div></div>
  {overview.audit.length>0&&<div className="tool-card"><h2>Activity</h2><ul className="text-sm mt-2 space-y-1">{overview.audit.slice(0,20).map((x,i)=><li key={i}>{new Date(x.created).toLocaleString()} · {x.action}{x.detail?` · ${x.detail}`:''}</li>)}</ul></div>}
 </section>;
}
