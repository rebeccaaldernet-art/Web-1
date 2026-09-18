'use client';
import {useEffect,useRef,useState} from 'react';
import {Camera,CheckCircle2,XCircle,AlertTriangle,Upload,ScanLine} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import type {InventoryProduct} from '@/lib/inventory';
import {paintingSignature,paintingSimilarity,matchDecision} from '@/lib/painting-match';
type Reference={id:string;signature:number[];product:InventoryProduct};
type Rect={x:number;y:number;w:number;h:number};
export default function InventoryScanner({site,product,onClose}:{site:string;product?:InventoryProduct;onClose:()=>void}){
 const video=useRef<HTMLVideoElement>(null),canvas=useRef<HTMLCanvasElement>(null),source=useRef<HTMLCanvasElement|null>(null),stream=useRef<MediaStream|null>(null),alive=useRef(true),pick=useRef<HTMLInputElement>(null),start=useRef<{x:number;y:number}|null>(null),autoScan=useRef(false);
 const [camera,setCamera]=useState(false),[hasPhoto,setHasPhoto]=useState(false),[crop,setCrop]=useState<Rect|null>(null),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[references,setReferences]=useState<Reference[]>([]),[loaded,setLoaded]=useState(false),[stamp,setStamp]=useState(''),[result,setResult]=useState<'match'|'review'|'none'|'saved'|null>(null),[matches,setMatches]=useState<(Reference&{score:number})[]>([]);
 function stopCamera(){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(video.current)video.current.srcObject=null;setCamera(false)}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;stream.current?.getTracks().forEach(t=>t.stop())}},[]);
 useEffect(()=>{if(!camera||!video.current)return;video.current.srcObject=stream.current;void video.current.play().catch(()=>setError('Tap the camera preview or try uploading a photo.'))},[camera]);
 useEffect(()=>{
  if(product){setLoaded(true);return}
  const c=new AbortController();
  void(async()=>{try{let offset=0,all:Reference[]=[];while(true){const r=await fetch('/api/inventory/scan?'+new URLSearchParams({site,offset:String(offset)}),{signal:AbortSignal.any([c.signal,AbortSignal.timeout(20000)]),cache:'no-store'});const d=await r.json() as {references:Reference[];hasMore:boolean;nextOffset:number;loadedAt:string;error?:string};if(!r.ok)throw Error(d.error||'References could not load.');all.push(...d.references);setStamp(d.loadedAt);if(!d.hasMore)break;offset=d.nextOffset;}if(!c.signal.aborted){setReferences(all);setLoaded(true)}}catch(e){if(!c.signal.aborted)setError('Could not load reference photos. Close Scan and try again. '+(e as Error).message)}})();
  return()=>c.abort();
 },[site,product]);
 async function openCamera(){setError('');setResult(null);try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera is unavailable here. Open RA Studio directly in your browser or upload a photo.');const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1600}},audio:false});if(!alive.current){s.getTracks().forEach(t=>t.stop());return}stream.current?.getTracks().forEach(t=>t.stop());stream.current=s;setCamera(true);setHasPhoto(false)}catch(e){setError((e as Error).name==='NotAllowedError'?'Camera permission was denied. Allow camera access in your browser, or upload a photo.':(e as Error).message)}}
 function usePhoto(image:CanvasImageSource,w:number,h:number){
  const scale=Math.min(1,1400/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.round(w*scale);c.height=Math.round(h*scale);c.getContext('2d')!.drawImage(image,0,0,c.width,c.height);source.current=c;setCrop({x:0,y:0,w:c.width,h:c.height});autoScan.current=!product;setHasPhoto(true);setResult(null);setError('');stopCamera();
 }
 async function upload(file?:File){
  if(!file)return;setError('');setResult(null);
  if((file.type&&!file.type.startsWith('image/'))||file.size>20*1024*1024){setError('Choose an image smaller than 20 MB.');return}
  setUploading(true);setHasPhoto(false);source.current=null;autoScan.current=false;
  const url=URL.createObjectURL(file);
  try{
   const img=new Image();
   await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Photo took too long to open. Try a smaller JPEG or PNG.')),15000);img.onload=()=>{clearTimeout(timer);resolve()};img.onerror=()=>{clearTimeout(timer);reject(Error('This image could not open. Export it as JPEG or PNG and try again.'))};img.src=url});
   if(alive.current)usePhoto(img,img.naturalWidth,img.naturalHeight);
  }catch(e){setError((e as Error).message)}finally{URL.revokeObjectURL(url);if(alive.current)setUploading(false)}
 }
 useEffect(()=>{
  if(!product&&hasPhoto&&loaded&&autoScan.current){autoScan.current=false;void compare()}
 },[hasPhoto,loaded,crop]);
 useEffect(()=>{if(!hasPhoto||!source.current||!canvas.current)return;const c=canvas.current,s=source.current;c.width=s.width;c.height=s.height;const ctx=c.getContext('2d')!;ctx.drawImage(s,0,0);if(crop){ctx.strokeStyle='#16a34a';ctx.lineWidth=Math.max(3,s.width/200);ctx.strokeRect(crop.x,crop.y,crop.w,crop.h)}},[hasPhoto,crop]);
 function point(e:React.PointerEvent<HTMLCanvasElement>){const c=e.currentTarget,r=c.getBoundingClientRect();return {x:Math.max(0,Math.min(c.width,(e.clientX-r.left)*c.width/r.width)),y:Math.max(0,Math.min(c.height,(e.clientY-r.top)*c.height/r.height))}}
 async function compare(){
  if(!source.current||!crop)return;setBusy(true);setError('');setResult(null);
  try{
   if(!product&&loaded&&!references.length)throw Error('Your photo opened successfully, but no reference photos are saved for this website. Close Scan and use Add reference photo beside the painting in Inventory, save it, then scan again. Website pictures are not yet indexed for scanning.');
   if(crop.w<30||crop.h<30)throw Error('Select a larger area containing the whole painting.');
   const resized=document.createElement('canvas');resized.width=16;resized.height=16;const ctx=resized.getContext('2d')!;ctx.drawImage(source.current,crop.x,crop.y,crop.w,crop.h,0,0,16,16);const signature=paintingSignature(ctx.getImageData(0,0,16,16).data);
   if(product){
    const photo=document.createElement('canvas'),scale=512/Math.max(crop.w,crop.h);photo.width=Math.max(1,Math.round(crop.w*scale));photo.height=Math.max(1,Math.round(crop.h*scale));photo.getContext('2d')!.drawImage(source.current,crop.x,crop.y,crop.w,crop.h,0,0,photo.width,photo.height);
    const blob=await new Promise<Blob|null>(r=>photo.toBlob(r,'image/jpeg',.88));if(!blob)throw Error('Could not prepare photo.');
    const form=new FormData();form.set('siteId',product.siteId);form.set('productId',product.id);form.set('signature',JSON.stringify(signature));form.set('photo',blob,'reference.jpg');
    const r=await fetch('/api/inventory/scan',{method:'POST',body:form,signal:AbortSignal.timeout(30000)});const d=await r.json() as {error?:string};if(!r.ok)throw Error(d.error);setResult('saved');
   }else{
    if(!loaded)throw Error('Reference photos are still loading. Please try again in a moment.');
    if(!references.length)throw Error('Your photo opened successfully, but this website has no saved reference photos to compare it with. Close Scan, find the painting in Inventory, and choose Add reference photo. After saving its photo, reopen Scan. Website pictures are not yet indexed for scanning.');
    const ranked=references.map(r=>({...r,score:paintingSimilarity(signature,r.signature)})).sort((a,b)=>b.score-a.score);
    setMatches(ranked.slice(0,3));setResult(matchDecision(ranked.map(r=>r.score)));
   }
  }catch(e){setError((e as Error).message||'Scan could not complete.')}finally{setBusy(false)}
 }
 return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent className="inventory-scanner"><DialogHeader><DialogTitle>{product?'Reference photo · '+product.name:'Scan a painting'}</DialogTitle><DialogDescription>{product?'Attach a clear photo to this inventory item. Saving replaces its previous reference photo.':'Upload or capture a photo to scan automatically. For a closer comparison, drag around the artwork and choose Match with inventory again.'}</DialogDescription></DialogHeader>
 {!product&&<p className="scan-note">{loaded?`${references.length} reference photos available for the selected website filter.`:'Loading reference photos…'}{loaded&&!references.length?' Website pictures are not yet indexed for scanning. Use Add reference photo beside an inventory item to enable matching for that item.':''}</p>}
 <div className="scan-actions"><button className="outline-button" onClick={()=>void openCamera()} disabled={busy||uploading}><Camera size={18}/>Open camera</button><button className="outline-button" onClick={()=>pick.current?.click()} disabled={busy||uploading}><Upload size={18}/>{uploading?'Opening photo…':'Upload photo'}</button><input hidden type="file" accept="image/*" ref={pick} onChange={e=>{void upload(e.target.files?.[0]);e.target.value=''}}/></div>
 {camera&&<><video ref={video} autoPlay playsInline muted className="scan-camera"/><button className="solid-button" onClick={()=>{const v=video.current;if(v?.videoWidth)usePhoto(v,v.videoWidth,v.videoHeight)}}><Camera size={18}/>Capture photo</button></>}
 {hasPhoto&&<><p className="scan-note">Drag from one corner of the artwork to the opposite corner. Keep the whole painting inside the green rectangle.</p><canvas ref={canvas} className="scan-crop" aria-label="Photo crop area. Drag to select the painting, or use the whole photo." onPointerDown={e=>{start.current=point(e);e.currentTarget.setPointerCapture(e.pointerId);setResult(null);setError('')}} onPointerMove={e=>{if(!start.current)return;const p=point(e),s=start.current;setCrop({x:Math.min(p.x,s.x),y:Math.min(p.y,s.y),w:Math.abs(p.x-s.x),h:Math.abs(p.y-s.y)})}} onPointerUp={()=>{start.current=null}} onPointerCancel={()=>{start.current=null}}/>
 <div className="scan-actions"><button className="outline-button" onClick={()=>{const s=source.current;if(s)setCrop({x:0,y:0,w:s.width,h:s.height});setResult(null)}}>Use whole photo</button><button className="solid-button" disabled={busy||!loaded} onClick={()=>void compare()}><ScanLine size={18}/>{busy?'Processing…':!loaded?'Loading references…':product?'Save reference photo':'Match with inventory'}</button></div></>}
 {error&&<p role="alert" className="error-banner">{error}</p>}
 {result&&<div className={'scan-result scan-'+result} role="status">{result==='match'||result==='saved'?<CheckCircle2 size={30}/>:result==='none'?<XCircle size={30}/>:<AlertTriangle size={30}/>}<strong>{result==='saved'?'Reference photo saved':result==='match'?'Visual match found':result==='none'?'No close visual match found':'Possible matches — please confirm'}</strong><p>{result==='none'?'Try a closer, straight-on photo with the background cropped out. A painting can be in inventory without having a matching reference photo.':result==='review'?'Similar images were found, but the scanner cannot identify one product confidently.':result==='match'?'Check the painting and SKU before making any stock changes.':''}</p></div>}
 {(result==='match'||result==='review')&&<div className="scan-matches">{matches.slice(0,result==='match'?1:3).map(m=><article key={m.id}><img src={'/api/inventory/scan?photo='+encodeURIComponent(m.id)} alt={'Reference for '+m.product.name}/><div><h3>{m.product.name}</h3><p>SKU: {m.product.sku||'Not supplied'}</p><p>{m.product.inStock===null?'Stock status not supplied':m.product.inStock?'In stock':'Out of stock'} · Quantity: {m.product.quantity??'Not tracked / see variants'}</p><p>{m.product.currency} {m.product.price??'Price not supplied'}</p><a className="outline-button" href={m.product.productUrl||m.product.url} target="_blank" rel="noopener noreferrer">{m.product.productUrl?'Open product on website ↗':'Open inventory item in Wix ↗'}</a></div></article>)}</div>}
 <p className="scan-note">Visual comparison works best with closely framed, straight-on photos. It cannot distinguish an original from a print of the same artwork. {stamp?'Quantities are from the inventory import on '+new Date(stamp).toLocaleDateString()+'. ':''}Scanning does not change stock.</p>
 </DialogContent></Dialog>;
}
