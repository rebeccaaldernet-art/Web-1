'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
type Person={memberId:string;userId:string|null;expires:number;lastSeen:number|null};
const Presence=createContext<Person[]|null>(null);
export function PresenceProvider({enabled,children}:{enabled:boolean;children:ReactNode}){
 const [people,setPeople]=useState<Person[]|null>(null);
 useEffect(()=>{
  if(!enabled){setPeople(null);return}
  const sessionId=crypto.randomUUID();let sequence=0,latest=0,disposed=false,closed=false;
  const payload=(active:boolean)=>JSON.stringify({sessionId,sequence:++sequence,active});
  const leave=()=>{closed=true;const body=payload(false);latest=sequence;try{if(navigator.sendBeacon('/api/presence',new Blob([body],{type:'application/json'})))return}catch{}void fetch('/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{})};
  const update=async()=>{
   if(disposed||closed||!navigator.onLine)return;const body=payload(true),request=sequence;latest=request;
   try{const r=await fetch('/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(8000),cache:'no-store'});if(!r.ok)throw Error();const d=await r.json() as {people:(Omit<Person,'expires'>&{remainingMs:number})[]};if(!disposed&&request===latest)setPeople(d.people.map(p=>({...p,expires:Date.now()+p.remainingMs})));}catch{if(!disposed&&request===latest)setPeople(null)}
  };
  const resume=()=>{closed=false;void update()};
  const visibility=()=>{if(!document.hidden)resume()};
  const offline=()=>{leave();setPeople(null)};
  void update();const heartbeat=setInterval(()=>void update(),10000);
  const expire=setInterval(()=>setPeople(prev=>prev?[...prev]:null),1000);
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',leave);window.addEventListener('pageshow',resume);window.addEventListener('online',resume);window.addEventListener('offline',offline);window.addEventListener('focus',resume);
  return()=>{disposed=true;clearInterval(heartbeat);clearInterval(expire);leave();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',leave);window.removeEventListener('pageshow',resume);window.removeEventListener('online',resume);window.removeEventListener('offline',offline);window.removeEventListener('focus',resume)};
 },[enabled]);
 return <Presence.Provider value={enabled?people:null}>{children}</Presence.Provider>;
}
function usePerson(memberId?:string,userId?:string){const people=useContext(Presence);return {known:people!==null,person:people?.find(p=>memberId?p.memberId===memberId:!!userId&&p.userId===userId)}}
export function OnlineDot({memberId,userId}:{memberId?:string;userId?:string}){
 const {person}=usePerson(memberId,userId);if(!person||person.expires<=Date.now())return null;
 return <span className="member-online-dot" role="img" aria-label="Online now" title="Online now"/>;
}
export function MemberActivity({memberId,userId}:{memberId?:string;userId?:string}){
 const {known,person}=usePerson(memberId,userId);
 if(!known)return <span className="member-last-active">Status unavailable</span>;
 if(person&&person.expires>Date.now())return <span className="member-last-active member-active-text">Active now</span>;
 if(!person?.lastSeen)return <span className="member-last-active">No activity recorded yet</span>;
 const date=new Date(person.lastSeen),today=date.toDateString()===new Date().toDateString();
 return <time className="member-last-active" dateTime={date.toISOString()} title={'Last active '+date.toLocaleString()}>Last active {today?'today at ':date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})+' at '}{date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</time>;
}
