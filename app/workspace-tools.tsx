'use client';
import {useCallback,useEffect,useState} from 'react';
import {Switch} from '@/components/ui/switch';
import {Skeleton} from '@/components/ui/skeleton';
import AccessPanel from './access-panel';
import {MemberDirectory} from './direct-messages';
import {toast} from 'sonner';
import {Megaphone} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
type Preferences={compact:boolean;enterToSend:boolean};
const defaults:Preferences={compact:false,enterToSend:true};
export function usePreferences(userId:string):[Preferences,(value:Preferences)=>void]{
 const [preferences,setPreferences]=useState(defaults);const key='commonroom-preferences:'+userId;
 useEffect(()=>{try{const p=JSON.parse(localStorage.getItem(key)||'null');setPreferences({compact:p?.compact===true,enterToSend:p?.enterToSend!==false})}catch{setPreferences(defaults)}},[key]);
 function save(value:Preferences){try{localStorage.setItem(key,JSON.stringify(value));setPreferences(value);toast.success('Preferences saved')}catch{toast.error('Preferences could not be saved in this browser.')}}
 return [preferences,save];
}
export function SettingsView({name,preferences,save}:{name:string;preferences:Preferences;save:(p:Preferences)=>void}){
 return <section className="workspace-tool"><h1>Settings</h1><p className="tool-intro">Manage workspace members and your conversation preferences.</p><MemberDirectory/><AccessPanel/><div className="tool-card"><h2>Account</h2><p>Signed in as <strong>{name}</strong></p></div><div className="tool-card"><h2>Conversation preferences</h2><p>Saved for your account in this browser.</p><div className="setting-row"><label htmlFor="compact-messages"><strong>Compact messages</strong><span>Reduce the space between messages.</span></label><Switch id="compact-messages" checked={preferences.compact} onCheckedChange={v=>save({...preferences,compact:v})}/></div><div className="setting-row"><label htmlFor="enter-send"><strong>Enter to send</strong><span>When off, Enter starts a new line. Use Send to post.</span></label><Switch id="enter-send" checked={preferences.enterToSend} onCheckedChange={v=>save({...preferences,enterToSend:v})}/></div></div></section>
}
type Analytics={messages:{total:number;contributors:number;recent:number};files:{total:number;bytes:number};channels:{id:string;name:string;messages:number;files:number}[]};
export function AnalyticsView({onChannel}:{onChannel:(id:string)=>void}){
 const [metaOpen,setMetaOpen]=useState(false);
 const [data,setData]=useState<Analytics|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const refresh=useCallback(async(signal?:AbortSignal)=>{setLoading(true);setError('');try{const r=await fetch('/api/analytics',{signal});const d=await r.json() as Analytics & {error?:string};if(!r.ok)throw Error(d.error||'Could not load analytics');setData(d)}catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'Could not load analytics')}finally{if(!signal?.aborted)setLoading(false)}},[]);
 useEffect(()=>{const c=new AbortController();void refresh(c.signal);return()=>c.abort()},[refresh]);
 return <section className="workspace-tool"><div className="tool-title"><h1>Analytics</h1><button className="outline-button" disabled={loading} onClick={()=>void refresh()}>{loading?'Loading…':'Refresh'}</button></div><p className="tool-intro">Activity across all channels. Counts reflect messages and files currently saved.</p><div className="tool-card"><div className="tool-title"><div><h2>Marketing</h2><p>Meta · Not connected yet</p></div><button className="outline-button" onClick={()=>setMetaOpen(true)}><Megaphone size={17}/>Meta Marketing</button></div></div><Dialog open={metaOpen} onOpenChange={setMetaOpen}><DialogContent><DialogHeader><DialogTitle>Meta Marketing</DialogTitle><DialogDescription>Not connected yet. Your Meta marketing link will be added here later.</DialogDescription></DialogHeader><button className="outline-button" onClick={()=>setMetaOpen(false)}>Close</button></DialogContent></Dialog>{error?<div className="error-banner" role="alert">{error}<button onClick={()=>void refresh()}>Try again</button></div>:loading?<Skeleton className="h-48 w-full"/>:data&&<><div className="metric-grid">{[['Messages',data.messages.total],['Messages in the last 7 days',data.messages.recent],['Contributors',data.messages.contributors],['Shared files',data.files.total]].map(([label,value])=><div className="tool-card metric" key={label}><span>{label}</span><strong>{Number(value).toLocaleString()}</strong></div>)}</div><p className="analytics-note">Contributors have sent at least one saved message. Total file size: {(data.files.bytes/1048576).toLocaleString(undefined,{maximumFractionDigits:2})} MB.</p><div className="tool-card"><h2>Channel activity</h2>{data.messages.total===0&&<p>No messages yet. Activity will appear when your team starts posting.</p>}<div className="activity-table"><table><thead><tr><th>Channel</th><th>Messages</th><th>Files</th></tr></thead><tbody>{data.channels.map(c=><tr key={c.id}><td><button onClick={()=>onChannel(c.id)}>#{c.name}</button></td><td>{c.messages.toLocaleString()}</td><td>{c.files.toLocaleString()}</td></tr>)}</tbody></table></div></div></>}</section>
}
