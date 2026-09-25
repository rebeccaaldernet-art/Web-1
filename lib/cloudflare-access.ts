// Sign-in for independent Cloudflare hosting. Cloudflare Access puts a signed JWT in the Cf-Access-Jwt-Assertion
// header after the visitor logs in. We verify it (RS256 signature against the team's published keys, issuer,
// audience and expiry) before trusting any identity, so request headers alone can never impersonate a member.
export type AccessConfig={teamDomain:string;aud:string};
export type AccessIdentity={userId:string;email:string};
type Jwk=JsonWebKey&{kid?:string};
let cache:{team:string;keys:Jwk[];fetched:number}|null=null;
const b64urlBytes=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
const b64urlJson=(s:string)=>JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
export function normalizeTeamDomain(v:string){const t=v.trim().replace(/\/+$/,'');return /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(t)?t.toLowerCase():null}
async function keys(team:string,fetchFn:typeof fetch,now:number,force:boolean){
 if(cache&&cache.team===team&&!force&&now-cache.fetched<3600000)return cache.keys;
 // A forced refresh (unknown key id) is limited to once a minute so forged tokens cannot hammer the certs endpoint.
 if(force&&cache&&cache.team===team&&now-cache.fetched<60000)return cache.keys;
 const r=await fetchFn(`${team}/cdn-cgi/access/certs`);if(!r.ok)throw Error('Access certificates unavailable');
 const d=await r.json() as {keys?:Jwk[]};cache={team,keys:Array.isArray(d.keys)?d.keys:[],fetched:now};return cache.keys;
}
export async function verifyAccessJwt(token:string|null,config:AccessConfig,fetchFn:typeof fetch=fetch,now=Date.now()):Promise<AccessIdentity|null>{
 const team=normalizeTeamDomain(config.teamDomain);if(!team||!config.aud||!token||token.length>8192)return null;
 const parts=token.split('.');if(parts.length!==3)return null;
 let header:{alg?:string;kid?:string},payload:{iss?:string;aud?:string|string[];exp?:number;nbf?:number;email?:string;sub?:string;type?:string};
 try{header=b64urlJson(parts[0]);payload=b64urlJson(parts[1])}catch{return null}
 if(header.alg!=='RS256'||typeof header.kid!=='string')return null;
 let jwk=(await keys(team,fetchFn,now,false)).find(k=>k.kid===header.kid);
 if(!jwk)jwk=(await keys(team,fetchFn,now,true)).find(k=>k.kid===header.kid);
 if(!jwk||jwk.kty!=='RSA')return null;
 const key=await crypto.subtle.importKey('jwk',{kty:'RSA',n:jwk.n,e:jwk.e,alg:'RS256',ext:true},{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64urlBytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
 if(!ok)return null;
 const aud=Array.isArray(payload.aud)?payload.aud:[payload.aud];
 const seconds=now/1000;
 if(payload.iss!==team||!aud.includes(config.aud)||typeof payload.exp!=='number'||payload.exp<seconds||typeof payload.nbf==='number'&&payload.nbf>seconds+60)return null;
 // Service tokens have an empty sub and no email; only signed-in people are members.
 if(typeof payload.sub!=='string'||!payload.sub||typeof payload.email!=='string'||!payload.email.includes('@'))return null;
 return {userId:'cf-access:'+payload.sub,email:payload.email.trim().toLowerCase()};
}
