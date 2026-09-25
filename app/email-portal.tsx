'use client';
import {useCallback,useEffect,useState} from 'react';
import {toast} from 'sonner';
import {PenSquare,Send,Megaphone,Settings,Search,ArrowLeft,Forward,RotateCcw,Loader2} from 'lucide-react';
import EmailCompose,{type ComposeDraft} from './email-compose';
import EmailCampaigns from './email-campaigns';
import EmailSettings from './email-settings';
type Folder='compose'|'sent'|'campaigns'|'settings';
type SentRow={id:string;to_list:string;cc_list:string;subject:string;snippet:string;status:string;error:string|null;created:number};
type Message={id:string;from_address:string;to_list:string;cc_list:string;bcc_list:string;subject:string;html:string;status:string;error:string|null;created:number};
const list=(v:string)=>{try{const a=JSON.parse(v);return Array.isArray(a)?a as string[]:[]}catch{return []}};
const statusLabel:Record<string,string>={sent:'Sent',delivered:'Delivered',sending:'Sending',failed:'Not sent',bounced:'Bounced',complained:'Marked as spam'};
function when(t:number){const d=new Date(t),today=new Date();return d.toDateString()===today.toDateString()?d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):d.toLocaleDateString([],{month:'short',day:'numeric',...(d.getFullYear()!==today.getFullYear()?{year:'numeric'}:{})})}
const escape=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
export default function EmailPortal({userId}:{userId:string}){
 const [folder,setFolder]=useState<Folder>('compose'),[from,setFrom]=useState<string|null>(null),[prefill,setPrefill]=useState<ComposeDraft|undefined>();
 const [composeKey,setComposeKey]=useState(0);
 const [rows,setRows]=useState<SentRow[]|null>(null),[query,setQuery]=useState(''),[more,setMore]=useState(false),[loadingMore,setLoadingMore]=useState(false),[open,setOpen]=useState<Message|null>(null),[error,setError]=useState('');
 const loadSender=useCallback(async()=>{try{const r=await fetch('/api/email',{cache:'no-store'});const d=await r.json() as {settings?:{from_name:string;from_email:string}|null};if(r.ok)setFrom(d.settings?.from_email?`${d.settings.from_name} <${d.settings.from_email}>`:null)}catch{}},[]);
 const loadSent=useCallback(async(q:string,before?:number)=>{try{const r=await fetch(`/api/email/messages?q=${encodeURIComponent(q)}${before?'&before='+before:''}`,{cache:'no-store'});const d=await r.json() as {messages:SentRow[];error?:string};if(!r.ok)throw Error(d.error);setError('');setRows(x=>before&&x?[...x,...d.messages]:d.messages);setMore(d.messages.length===50)}catch(e){setError(e instanceof Error&&e.message?e.message:'Sent mail could not load.')}},[]);
 useEffect(()=>{const t=setTimeout(()=>void loadSender());return()=>clearTimeout(t)},[loadSender]);
 useEffect(()=>{if(folder!=='sent')return;const t=setTimeout(()=>void loadSent(query),query?300:0);return()=>clearTimeout(t)},[folder,query,loadSent]);
 function go(f:Folder){setOpen(null);setFolder(f)}
 function compose(d?:ComposeDraft){setPrefill(d);setComposeKey(k=>k+1);go('compose')}
 async function read(id:string){try{const r=await fetch('/api/email/messages?id='+encodeURIComponent(id),{cache:'no-store'});const d=await r.json() as {message:Message;error?:string};if(!r.ok)throw Error(d.error);setOpen(d.message)}catch(e){toast.error(e instanceof Error?e.message:'Could not open email.')}}
 function forward(m:Message){compose({to:[],cc:[],bcc:[],subject:/^fwd:/i.test(m.subject)?m.subject:'Fwd: '+m.subject,html:`<br><br><div>---------- Forwarded message ----------<br>From: ${escape(m.from_address)}<br>Date: ${new Date(m.created).toLocaleString()}<br>Subject: ${escape(m.subject)}<br>To: ${escape(list(m.to_list).join(', '))}<br><br></div>${m.html}`})}
 function again(m:Message){compose({to:list(m.to_list),cc:list(m.cc_list),bcc:list(m.bcc_list),subject:m.subject,html:m.html})}
 const nav:[Folder,string,typeof Send][]=[['sent','Sent',Send],['campaigns','Campaigns',Megaphone],['settings','Settings',Settings]];
 return <section className="workspace-tool email-portal">
  <aside className="email-rail">
   <button className="solid-button email-compose-button" onClick={()=>compose()}><PenSquare size={18}/>Compose</button>
   <nav aria-label="Email folders">{nav.map(([f,label,Icon])=><button key={f} className={folder===f?'active':''} aria-current={folder===f?'page':undefined} onClick={()=>go(f)}><Icon size={17}/>{label}</button>)}</nav>
  </aside>
  <div className="email-main">
   {folder==='compose'&&<EmailCompose key={composeKey} userId={userId} from={from} initial={prefill} onSent={()=>{setPrefill(undefined);setQuery('');go('sent')}} onDiscard={()=>{setPrefill(undefined);go('sent')}}/>}
   {folder==='campaigns'&&<EmailCampaigns/>}
   {folder==='settings'&&<EmailSettings onSaved={()=>void loadSender()}/>}
   {folder==='sent'&&(open?<article className="email-reader">
     <div className="email-reader-actions"><button className="outline-button" onClick={()=>setOpen(null)}><ArrowLeft size={16}/>Back to Sent</button><button className="outline-button" onClick={()=>forward(open)}><Forward size={16}/>Forward</button><button className="outline-button" onClick={()=>again(open)}><RotateCcw size={16}/>Edit and send again</button></div>
     <h1>{open.subject||'(no subject)'}</h1>
     <dl className="email-headers"><dt>From</dt><dd>{open.from_address}</dd><dt>To</dt><dd>{list(open.to_list).join(', ')}</dd>{list(open.cc_list).length>0&&<><dt>Cc</dt><dd>{list(open.cc_list).join(', ')}</dd></>}{list(open.bcc_list).length>0&&<><dt>Bcc</dt><dd>{list(open.bcc_list).join(', ')}</dd></>}<dt>Date</dt><dd>{new Date(open.created).toLocaleString()}</dd><dt>Status</dt><dd><span className={'email-status '+open.status}>{statusLabel[open.status]||open.status}</span>{open.error&&<> · {open.error}</>}</dd></dl>
     <iframe title="Email content" sandbox="" className="email-frame" srcDoc={`<!doctype html><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#1f2a22;margin:0;padding:4px}</style>${open.html}`}/>
    </article>:<div>
     <div className="tool-title"><h1>Sent</h1><label className="email-search"><Search size={16}/><input type="search" placeholder="Search sent mail" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search sent mail"/></label></div>
     {error?<div className="error-banner" role="alert">{error}<button onClick={()=>void loadSent(query)}>Try again</button></div>:rows===null?<p>Loading…</p>:rows.length===0?<div className="tool-card"><p>{query?'No sent email matches your search.':'Nothing sent yet.'}</p>{!query&&<button className="solid-button mt-3" onClick={()=>compose()}><PenSquare size={16}/>Write an email</button>}</div>:
     <ul className="email-list">{rows.map(m=><li key={m.id}><button onClick={()=>void read(m.id)}><span className="email-list-to">To: {[...list(m.to_list),...list(m.cc_list)].join(', ')}</span><span className="email-list-subject"><strong>{m.subject||'(no subject)'}</strong>{m.snippet&&<span> — {m.snippet}</span>}</span>{m.status!=='sent'&&m.status!=='delivered'&&<span className={'email-status '+m.status}>{statusLabel[m.status]||m.status}</span>}<time>{when(m.created)}</time></button></li>)}</ul>}
     {more&&rows&&<button className="outline-button mt-3" disabled={loadingMore} onClick={async()=>{setLoadingMore(true);await loadSent(query,rows[rows.length-1].created);setLoadingMore(false)}}>{loadingMore&&<Loader2 size={16} className="animate-spin"/>}Load older</button>}
    </div>)}
  </div>
 </section>;
}
