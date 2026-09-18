import {MAX_FILE_BYTES} from '@/lib/transfers';
export async function transferRequest(url:string,options:RequestInit,signal?:AbortSignal){
 let last:unknown;for(let attempt=0;attempt<3;attempt++){
  if(signal?.aborted)throw new DOMException('Upload cancelled','AbortError');
  try{const r=await fetch(url,{...options,signal});if(r.status>=500||r.status===429){throw Error('Transfer temporarily unavailable');}const data=await r.json() as Record<string,any>;if(!r.ok)throw Object.assign(Error(data.error||'Transfer failed'),{permanent:true});return data;}catch(e){last=e;if(signal?.aborted||(e as {permanent?:boolean}).permanent)throw e;}
  await new Promise(resolve=>setTimeout(resolve,750*2**attempt));
 }throw last||Error('Transfer failed');
}
export async function transferFiles(files:File[],batch:string,channel:string,signal:AbortSignal,onProgress:(text:string)=>void){
 const total=files.reduce((sum,f)=>sum+f.size,0);let done=0;
 for(let i=0;i<files.length;i++){
  const file=files[i];if(file.size>MAX_FILE_BYTES)throw Error(file.name+' exceeds 78.1 GiB per file.');
  const id=crypto.randomUUID();const started=await transferRequest('/api/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,batch,channel,name:file.name,size:file.size,type:file.type})},signal);
  const parts=[];for(let offset=0;offset<file.size;offset+=started.chunkSize){
   const chunk=file.slice(offset,Math.min(offset+started.chunkSize,file.size));
   onProgress(`Uploading ${i+1}/${files.length}: ${file.name} · ${total?Math.round(done/total*100):0}%`);
   parts.push(await transferRequest(`/api/uploads/${id}?part=${parts.length+1}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:chunk},signal));done+=chunk.size;
  }
  if(started.state!=='complete')await transferRequest('/api/uploads/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parts})},signal);
 }
 onProgress('Files uploaded. Sending message…');
}
