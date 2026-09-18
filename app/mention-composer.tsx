'use client';
import {useEffect,useState,type RefObject} from 'react';
import {messageLinks} from '@/lib/message-links';
import type {MentionPerson} from '@/lib/mentions';
export function useMentionComposer({draft,setDraft,input,enabled}:{draft:string;setDraft:(s:string)=>void;input:RefObject<HTMLTextAreaElement|null>;enabled:boolean}){
 const [members,setMembers]=useState<MentionPerson[]>([]),[caret,setCaret]=useState(0),[selected,setSelected]=useState(0),[dismissed,setDismissed]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!enabled)return;const c=new AbortController();const load=async()=>{try{const r=await fetch('/api/mentions',{signal:c.signal});const d=await r.json() as {members:MentionPerson[];error?:string};if(!r.ok)throw Error(d.error);setMembers(d.members);setError('')}catch{if(!c.signal.aborted)setError('Member list unavailable. Try again shortly.')}};void load();const t=setInterval(()=>void load(),30000);return()=>{c.abort();clearInterval(t)}},[enabled]);
 const match=draft.slice(0,caret).match(/(?:^|\s)@([a-zA-Z0-9-]*)$/);const open=enabled&&!dismissed&&!!match;
 const query=match?.[1].toLowerCase()||'';const options=[{id:'all',name:'Everyone with chat access',handle:'all'},...members].filter(m=>m.handle.includes(query)||m.name.toLowerCase().includes(query)).slice(0,8);
 function choose(m:MentionPerson){const start=caret-(match?.[1].length||0)-1;const text='@'+m.handle+' ';setDraft(draft.slice(0,start)+text+draft.slice(caret));setDismissed(true);requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(start+text.length,start+text.length)})}
 const changed=(value:string,position:number)=>{setDraft(value);setCaret(position);setSelected(0);setDismissed(false)};
 function keyDown(e:React.KeyboardEvent<HTMLTextAreaElement>){if(!open)return false;if(e.key==='Escape'){e.preventDefault();setDismissed(true);return true;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setSelected(i=>Math.max(0,Math.min(options.length-1,i+(e.key==='ArrowDown'?1:-1))));return true;}if((e.key==='Enter'||e.key==='Tab')&&options.length&&!e.nativeEvent.isComposing){e.preventDefault();choose(options[Math.min(selected,options.length-1)]);return true;}return false;}
 const picker=open?<div className="mention-picker" id="mention-options" role="listbox" aria-label="Mention a member">{options.map((m,i)=><button type="button" id={'mention-option-'+i} role="option" aria-selected={selected===i} key={m.id} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(m)}><strong>@{m.handle}</strong><span>{m.name}</span></button>)}{!options.length&&<p>No matching members.</p>}{error&&<p role="status">{error}</p>}<small>↑ ↓ to choose · Enter to tag · @all to alert everyone</small></div>:null;
 return {picker,open,activeOption:open&&options.length?'mention-option-'+Math.min(selected,options.length-1):undefined,changed,keyDown,select:(n:number)=>{setCaret(n);setDismissed(false)}};
}
export function MentionText({body,mentions}:{body:string;mentions?:string}){
 let parsed:{all?:boolean;members?:MentionPerson[]}={};try{parsed=JSON.parse(mentions||'{}')}catch{}
 const handles=new Set((parsed.members||[]).map(m=>m.handle));if(parsed.all)handles.add('all');
 return <>{messageLinks(body).map((segment,index)=>segment.href?<a key={index} className="message-link" href={segment.href} target="_blank" rel="noopener noreferrer">{segment.text}</a>:<span key={index}>{segment.text.split(/(@[a-zA-Z0-9][a-zA-Z0-9-]*)/g).map((part,i)=>part[0]==='@'&&handles.has(part.slice(1).toLowerCase())?<mark className="mention-tag" key={i}>{part}</mark>:part)}</span>)}</>;
}
