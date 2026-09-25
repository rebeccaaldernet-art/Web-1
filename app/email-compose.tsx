'use client';
import {useEffect,useRef,useState,type KeyboardEvent,type ClipboardEvent} from 'react';
import {toast} from 'sonner';
import {Bold,Italic,Underline,List,ListOrdered,Link as LinkIcon,RemoveFormatting,Send,Trash2,X,Loader2} from 'lucide-react';
export type ComposeDraft={to:string[];cc:string[];bcc:string[];subject:string;html:string};
export const emptyDraft:ComposeDraft={to:[],cc:[],bcc:[],subject:'',html:''};
const MAX=50;
const valid=(v:string)=>v.length<=254&&/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:.]{2,}$/.test(v);
// Accepts "Name <a@b.com>, c@d.com; e@f.com" and returns bare lowercase addresses.
export function splitAddresses(v:string){return v.split(/[,;\n]+/).map(s=>{const m=s.match(/<([^>]+)>/);return (m?m[1]:s).trim().toLowerCase()}).filter(Boolean)}
const draftKey=(userId:string)=>'ra-email-draft:'+userId;
// Content loaded into the editor (saved drafts, forwards) is stripped of scripts, event handlers and script URLs.
function sanitize(html:string){const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,textarea,select,meta,link,base').forEach(n=>n.remove());
 doc.body.querySelectorAll('*').forEach(el=>{for(const at of [...el.attributes]){if(/^on/i.test(at.name)||/^\s*(javascript|vbscript|data):/i.test(at.value)&&/^(href|src|action|xlink:href|formaction)$/i.test(at.name))el.removeAttribute(at.name)}});return doc.body.innerHTML}

function RecipientField({label,values,onChange,autoFocus,trailing}:{label:string;values:string[];onChange:(v:string[])=>void;autoFocus?:boolean;trailing?:React.ReactNode}){
 const [text,setText]=useState('');
 function commit(raw=text){const next=[...values];for(const a of splitAddresses(raw))if(!next.includes(a))next.push(a);onChange(next);setText('')}
 function key(e:KeyboardEvent<HTMLInputElement>){if(['Enter',',',';','Tab'].includes(e.key)&&text.trim()){if(e.key!=='Tab')e.preventDefault();commit()}else if(e.key==='Backspace'&&!text&&values.length)onChange(values.slice(0,-1))}
 function paste(e:ClipboardEvent<HTMLInputElement>){const t=e.clipboardData.getData('text');if(/[,;\n]/.test(t)){e.preventDefault();commit(text+','+t)}}
 const id='compose-'+label.toLowerCase();
 return <div className="compose-row"><label htmlFor={id}>{label}</label><div className="compose-chips">{values.map(v=><span key={v} className={'compose-chip'+(valid(v)?'':' invalid')} title={valid(v)?v:'Not a valid email address'}>{v}<button type="button" aria-label={'Remove '+v} onClick={()=>onChange(values.filter(x=>x!==v))}><X size={12}/></button></span>)}
  <input id={id} autoFocus={autoFocus} value={text} onChange={e=>setText(e.target.value)} onKeyDown={key} onPaste={paste} onBlur={()=>text.trim()&&commit()} type="email" multiple autoComplete="email" placeholder={values.length?'':'name@example.com'}/></div>{trailing}</div>;
}

export default function EmailCompose({userId,from,initial,onSent,onDiscard}:{userId:string;from:string|null;initial?:ComposeDraft;onSent:()=>void;onDiscard:()=>void}){
 const [draft,setDraft]=useState<ComposeDraft>(emptyDraft),[showCc,setShowCc]=useState(false),[showBcc,setShowBcc]=useState(false),[sending,setSending]=useState(false);
 const editor=useRef<HTMLDivElement>(null),messageId=useRef(crypto.randomUUID()),loaded=useRef(false);
 // Restore an unsent draft saved in this browser, unless the caller passed one (for example Forward).
 useEffect(()=>{let d=initial;if(!d){try{d=JSON.parse(localStorage.getItem(draftKey(userId))||'null')||undefined}catch{}}
  const t=setTimeout(()=>{if(d){const html=sanitize(d.html);setDraft({...d,html});setShowCc(d.cc.length>0);setShowBcc(d.bcc.length>0);if(editor.current)editor.current.innerHTML=html}loaded.current=true});return()=>clearTimeout(t)},[initial,userId]);
 useEffect(()=>{if(!loaded.current)return;const t=setTimeout(()=>{try{const empty=!draft.to.length&&!draft.cc.length&&!draft.bcc.length&&!draft.subject&&!draft.html.replace(/<br>|<\/?div>/g,'').trim();if(empty)localStorage.removeItem(draftKey(userId));else localStorage.setItem(draftKey(userId),JSON.stringify(draft))}catch{}},400);return()=>clearTimeout(t)},[draft,userId]);
 const set=(p:Partial<ComposeDraft>)=>setDraft(d=>({...d,...p}));
 const all=[...draft.to,...draft.cc,...draft.bcc],invalid=all.filter(a=>!valid(a));
 function format(command:string,value?:string){editor.current?.focus();document.execCommand(command,false,value);set({html:editor.current?.innerHTML||''})}
 function link(){const url=window.prompt('Link address (https://…)');if(!url)return;if(!/^(https?:|mailto:)/i.test(url.trim())){toast.error('Links must start with https://, http:// or mailto:');return}format('createLink',url.trim())}
 function clear(){try{localStorage.removeItem(draftKey(userId))}catch{}setDraft(emptyDraft);if(editor.current)editor.current.innerHTML='';messageId.current=crypto.randomUUID()}
 async function send(){
  if(sending)return;
  if(!draft.to.length){toast.error('Add at least one recipient in To.');return}
  if(invalid.length){toast.error('Fix the highlighted addresses: '+invalid.join(', '));return}
  if(all.length>MAX){toast.error(`An email can go to at most ${MAX} addresses. Use Campaigns for larger lists.`);return}
  const html=editor.current?.innerHTML||'';
  if(!draft.subject.trim()&&!window.confirm('Send this email without a subject?'))return;
  setSending(true);
  try{const r=await fetch('/api/email/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'send',id:messageId.current,to:draft.to,cc:draft.cc,bcc:draft.bcc,subject:draft.subject,html})});const d=await r.json().catch(()=>({})) as {error?:string};
   if(!r.ok)throw Error(d.error||'The email was not sent.');
   toast.success(`Email sent to ${all.length} ${all.length===1?'recipient':'recipients'}`);clear();onSent()}
  catch(e){toast.error(e instanceof Error?e.message:'The email was not sent.')}finally{setSending(false)}}
 return <form className="compose" onSubmit={e=>{e.preventDefault();void send()}} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();void send()}}}>
  <div className="compose-head"><h2>New message</h2><button type="button" className="icon-btn" aria-label="Close" onClick={onDiscard}><X size={18}/></button></div>
  <div className="compose-row"><label>From</label><span className="compose-from">{from||<em>Set your sender in Email settings</em>}</span></div>
  <RecipientField label="To" values={draft.to} onChange={to=>set({to})} autoFocus={!initial} trailing={<span className="compose-toggles">{!showCc&&<button type="button" onClick={()=>setShowCc(true)}>Cc</button>}{!showBcc&&<button type="button" onClick={()=>setShowBcc(true)}>Bcc</button>}</span>}/>
  {showCc&&<RecipientField label="Cc" values={draft.cc} onChange={cc=>set({cc})}/>}
  {showBcc&&<RecipientField label="Bcc" values={draft.bcc} onChange={bcc=>set({bcc})}/>}
  <div className="compose-row"><label htmlFor="compose-subject">Subject</label><input id="compose-subject" value={draft.subject} maxLength={200} onChange={e=>set({subject:e.target.value})}/></div>
  <div className="compose-toolbar" role="toolbar" aria-label="Formatting">
   {([['bold',Bold,'Bold'],['italic',Italic,'Italic'],['underline',Underline,'Underline'],['insertUnorderedList',List,'Bulleted list'],['insertOrderedList',ListOrdered,'Numbered list']] as const).map(([cmd,Icon,name])=><button key={cmd} type="button" title={name} aria-label={name} onMouseDown={e=>e.preventDefault()} onClick={()=>format(cmd)}><Icon size={16}/></button>)}
   <button type="button" title="Insert link" aria-label="Insert link" onMouseDown={e=>e.preventDefault()} onClick={link}><LinkIcon size={16}/></button>
   <button type="button" title="Clear formatting" aria-label="Clear formatting" onMouseDown={e=>e.preventDefault()} onClick={()=>format('removeFormat')}><RemoveFormatting size={16}/></button>
  </div>
  <div ref={editor} className="compose-body" contentEditable={!sending} role="textbox" aria-multiline="true" aria-label="Message" data-placeholder="Write your message…" suppressContentEditableWarning onInput={e=>set({html:(e.target as HTMLDivElement).innerHTML})}/>
  <div className="compose-foot"><button type="submit" className="solid-button" disabled={sending||!from}>{sending?<Loader2 size={16} className="animate-spin"/>:<Send size={16}/>}{sending?'Sending…':'Send'}</button>
   <span className="compose-hint">{all.length>0?`${all.length} of ${MAX} recipients`:'Ctrl + Enter to send'}</span>
   <button type="button" className="icon-btn" title="Discard draft" aria-label="Discard draft" disabled={sending} onClick={()=>{if(window.confirm('Discard this draft?')){clear();onDiscard()}}}><Trash2 size={17}/></button></div>
 </form>;
}
