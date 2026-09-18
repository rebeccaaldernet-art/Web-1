const encode=(v:Uint8Array)=>btoa(String.fromCharCode(...v));
const decode=(v:string)=>Uint8Array.from(atob(v),c=>c.charCodeAt(0));
async function key(secret:string){return crypto.subtle.importKey('raw',decode(secret),{name:'AES-GCM'},false,['encrypt','decrypt'])}
const additionalData=new TextEncoder().encode('ra-studio:wix-inventory:v1');
export async function sealCredential(value:string,secret:string){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},await key(secret),new TextEncoder().encode(value));return {iv:encode(iv),cipher:encode(new Uint8Array(cipher))}}
export async function openCredential(value:{iv:string;cipher:string},secret:string){const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(value.iv),additionalData},await key(secret),decode(value.cipher));return new TextDecoder().decode(plain)}
