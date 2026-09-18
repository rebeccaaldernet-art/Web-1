'use client';
import {toast} from 'sonner';
import {useEffect,useState,useRef} from 'react';
type Snapshot={channel:string;seq:number};
type UnreadData={directSeq?:number;directCounts?:Record<string,number>;newestSeq:number;counts:Record<string,number>;mentions:Record<string,number>;alerts:{id:string;author:string;channel:string}[]};
export function useUnread({channel,enabled,reading,snapshot,memberId}:{memberId:string;channel:string;enabled:boolean;reading:boolean;snapshot:Snapshot|null}){
 const audio=useRef<AudioContext|null>(null),soundOn=useRef(true);
 const [soundEnabled,setSoundEnabled]=useState(true);
 function ping(){
  const ctx=audio.current;if(!soundOn.current||!ctx||ctx.state!=='running')return;
  const now=ctx.currentTime;
  [880,1174.66].forEach((frequency,i)=>{
   const oscillator=ctx.createOscillator(),gain=ctx.createGain();
   oscillator.type='sine';oscillator.frequency.value=frequency;
   gain.gain.setValueAtTime(0,now+i*.12);gain.gain.linearRampToValueAtTime(.12,now+i*.12+.012);gain.gain.exponentialRampToValueAtTime(.001,now+i*.12+.3);
   oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(now+i*.12);oscillator.stop(now+i*.12+.32);
   oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()};
  });
 }
 const soundKey='commonroom-sound:'+memberId;
 async function unlockSound(){
  if(!soundOn.current)return;
  const Audio=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  if(!Audio)throw Error('Sound is not supported in this browser.');
  const ctx=audio.current??(audio.current=new Audio());
  if(ctx.state!=='running')await ctx.resume();
 }
 function saveSound(value:boolean){
  soundOn.current=value;setSoundEnabled(value);
  try{window.localStorage.setItem(soundKey,value?'on':'off')}catch{/* The toggle still works for this visit. */}
 }
 async function toggleSound(){
  if(soundOn.current){saveSound(false);return;}
  saveSound(true);
  try{await unlockSound();ping()}catch(e){toast.error(e instanceof Error?e.message:'Could not enable sound.');}
 }
 useEffect(()=>{
  let allowed=true;
  try{allowed=window.localStorage.getItem(soundKey)!=='off'}catch{/* Default on when preferences cannot be saved. */}
  soundOn.current=allowed;setSoundEnabled(allowed);
  if(!enabled)return;
  // Browser autoplay policy still applies. A normal click or keypress unlocks audio.
  const activate=()=>{if(soundOn.current)void unlockSound().catch(()=>{})};
  activate();
  window.addEventListener('click',activate);window.addEventListener('keydown',activate);
  return()=>{window.removeEventListener('click',activate);window.removeEventListener('keydown',activate);soundOn.current=false;void audio.current?.close().catch(()=>{});audio.current=null};
 },[enabled,soundKey]);
 const seenAlerts=useRef(new Set<string>());
 const latest=useRef({channel,reading,snapshot});latest.current={channel,reading,snapshot};
 const refresh=useRef<()=>Promise<void>>(async()=>{});
 const [counts,setCounts]=useState<Record<string,number>>({});
 const [directTotal,setDirectTotal]=useState(0);
 const [mentionTotal,setMentionTotal]=useState(0),[error,setError]=useState(''),[marking,setMarking]=useState(false);
 useEffect(()=>{
  if(!enabled){setCounts({});setDirectTotal(0);setMentionTotal(0);setError('');return;}
  const controller=new AbortController();let busy=false,again=false,seenSeq:number|null=null,seenDirect:number|null=null;
  async function update(){
   if(controller.signal.aborted)return;
   if(busy){again=true;return;}busy=true;
   try{
    const r=await fetch('/api/unread',{cache:'no-store',signal:controller.signal});
    if(r.status===401||r.status===403){setCounts({});setDirectTotal(0);setMentionTotal(0);setError('Sign in with workspace access to receive notifications.');return;}
    if(!r.ok)throw Error('Could not check new messages. Retrying…');
    const d=await r.json() as UnreadData;
    if(!controller.signal.aborted){
     if(seenSeq!==null&&(d.newestSeq>seenSeq||(seenDirect!==null&&(d.directSeq||0)>seenDirect))){try{ping()}catch{/* Audio failure must not interrupt unread counts. */}}
     seenSeq=Math.max(seenSeq??0,d.newestSeq??0);seenDirect=Math.max(seenDirect??0,d.directSeq||0);setDirectTotal(Object.values(d.directCounts||{}).reduce((sum,n)=>sum+n,0));
     setCounts(d.counts);setError('');setMentionTotal(Object.values(d.mentions||{}).reduce((sum,n)=>sum+n,0));
     const fresh=(d.alerts||[]).filter(a=>!seenAlerts.current.has(a.id));fresh.forEach(a=>seenAlerts.current.add(a.id));
     if(fresh.length)toast(fresh.length===1?fresh[0].author+' mentioned you or @all':fresh.length+' new mentions',{description:'Open the conversation to read the message.'});
    }
   }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not check new messages. Retrying…');}
   finally{busy=false;if(again){again=false;void update();}}
  }
  refresh.current=update;void update();
  // Keep a single poll alive across chat refreshes, channel changes and background tabs.
  const timer=setInterval(()=>void update(),4000),activate=()=>void update();
  window.addEventListener('focus',activate);window.addEventListener('online',activate);document.addEventListener('visibilitychange',activate);
  return()=>{controller.abort();clearInterval(timer);refresh.current=async()=>{};window.removeEventListener('focus',activate);window.removeEventListener('online',activate);document.removeEventListener('visibilitychange',activate)};
 },[enabled]);
 useEffect(()=>{
  if(!enabled)return;
  const controller=new AbortController(),acknowledged=new Map<string,number>();let busy=false;
  async function checkRead(){
   const current=latest.current,scroll=document.querySelector<HTMLElement>('.message-scroll');
   if(busy||controller.signal.aborted||!current.reading||document.hidden||!document.hasFocus()||!scroll||scroll.clientHeight<=0||scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight>40)return;
   const rendered=current.snapshot;
   if(!rendered||rendered.channel!==current.channel||rendered.seq<=(acknowledged.get(current.channel)||0))return;
   busy=true;
   try{
    const r=await fetch('/api/unread',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:rendered.channel,through:rendered.seq}),signal:controller.signal});
    if(r.ok&&!controller.signal.aborted){acknowledged.set(rendered.channel,rendered.seq);await refresh.current();}
   }catch{/* Retry on the next visibility/scroll check; keep the unread badge on failure. */}finally{busy=false;}
  }
  const activate=()=>void checkRead();
  const timer=setInterval(activate,500);
  window.addEventListener('focus',activate);document.addEventListener('visibilitychange',activate);document.addEventListener('scroll',activate,true);
  return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',activate);document.removeEventListener('visibilitychange',activate);document.removeEventListener('scroll',activate,true)};
 },[enabled,memberId]);
 async function markRead(){
  const current=latest.current;
  if(!enabled||marking||!current.reading||current.snapshot?.channel!==current.channel)return;
  setMarking(true);
  try{
   const r=await fetch('/api/unread',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:current.channel,through:current.snapshot.seq})});
   if(!r.ok)throw Error('Could not mark messages as read. Please try again.');
   await refresh.current();
  }catch(e){toast.error(e instanceof Error?e.message:'Could not mark messages as read.');}finally{setMarking(false);}
 }
 const channelTotal=Object.values(counts).reduce((sum,n)=>sum+n,0),total=channelTotal+directTotal;
 useEffect(()=>{
  const title=document.title;
  const icons=Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
  const originals=icons.map(icon=>({href:icon.href,type:icon.type}));
  const badge=document.createElement('link');badge.rel='icon';badge.type='image/png';
  const normalTitle=total?`(${total}) RA Studio — Team workspace`:'RA Studio — Team workspace';
  document.title=normalTitle;let alternate=false;
  const updateTitle=()=>{alternate=document.hidden&&!alternate;document.title=alternate?`(${total}) New ${total===1?'message':'messages'} · RA Studio`:normalTitle};
  const titleTimer=total?setInterval(updateTitle,2000):undefined;
  const restoreTitle=()=>{alternate=false;document.title=normalTitle};
  window.addEventListener('focus',restoreTitle);document.addEventListener('visibilitychange',restoreTitle);
  if(total){
   const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');
   if(ctx){
    ctx.fillStyle='#172b29';ctx.fillRect(0,0,64,64);ctx.fillStyle='#dc2626';ctx.beginPath();ctx.arc(32,32,29,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ffffff';ctx.font=`bold ${total>99?22:32}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(total>99?'99+':String(total),32,34);
    badge.href=canvas.toDataURL('image/png');
    icons.forEach(icon=>{icon.href=badge.href;icon.type=badge.type});document.head.appendChild(badge);
   }
  }
  return()=>{clearInterval(titleTimer);window.removeEventListener('focus',restoreTitle);document.removeEventListener('visibilitychange',restoreTitle);document.title=title;badge.remove();icons.forEach((icon,i)=>{icon.href=originals[i].href;icon.type=originals[i].type})};
 },[total]);
 return {counts,total,channelTotal,directTotal,mentionTotal,error,marking,markRead,soundEnabled,toggleSound};
}
