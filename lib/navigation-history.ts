export type PortalLocation={view:string;channel:string;thread:string};
const views=new Set(['home','team','messages','files','direct','inventory','datalake','email','orders','wix','analytics','settings']);
function valid(v:unknown):v is PortalLocation{const x=v as PortalLocation;return !!x&&views.has(x.view)&&typeof x.channel==='string'&&typeof x.thread==='string'}
const same=(a:PortalLocation,b:PortalLocation)=>a.view===b.view&&a.channel===b.channel&&a.thread===b.thread;
export function createPortalHistory(history:Pick<History,'state'|'replaceState'|'pushState'|'back'>,events:Pick<Window,'addEventListener'|'removeEventListener'>,initial:PortalLocation,onRestore:(v:PortalLocation)=>void,onBackAvailable:(v:boolean)=>void,session:string){
 let current=initial,index=0;
 const payload=()=>({...history.state,raPortal:{session,index,location:current}});
 history.replaceState(payload(),'');onBackAvailable(false);
 const pop=(event:Event)=>{const entry=(event as PopStateEvent).state?.raPortal;if(entry?.session!==session||!Number.isSafeInteger(entry.index)||entry.index<0||!valid(entry.location))return;index=entry.index;current=entry.location;onBackAvailable(index>0);onRestore(current)};
 events.addEventListener('popstate',pop);
 return {record(next:PortalLocation){if(same(current,next))return;current=next;index++;history.pushState(payload(),'');onBackAvailable(true)},back(){if(index>0)history.back()},dispose(){events.removeEventListener('popstate',pop)}};
}
