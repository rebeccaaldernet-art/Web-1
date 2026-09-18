// Local perceptual comparison of tightly cropped, straight-on reference photos.
// Similarity is not a probability and cannot distinguish editions of the same art.
export const SIGNATURE_SIZE=280;
export function paintingSignature(pixels:Uint8ClampedArray):number[]{
 if(pixels.length!==16*16*4)throw Error('Expected a 16 × 16 image.');
 const gray:number[]=[],hist=new Array(24).fill(0);
 for(let i=0;i<pixels.length;i+=4){
  gray.push((.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2])/255);
  for(let c=0;c<3;c++)hist[c*8+Math.min(7,Math.floor(pixels[i+c]/32))]+=1/256;
 }
 const mean=gray.reduce((a,b)=>a+b,0)/256;
 const std=Math.sqrt(gray.reduce((a,b)=>a+(b-mean)**2,0)/256);
 if(std<.025)throw Error('Not enough image detail. Retake the photo with the painting filling the frame.');
 return [...gray.map(v=>Number(((v-mean)/std).toFixed(5))),...hist];
}
export function validSignature(v:unknown):v is number[]{return Array.isArray(v)&&v.length===SIGNATURE_SIZE&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=20)}
export function paintingSimilarity(a:number[],b:number[]){
 if(!validSignature(a)||!validSignature(b))return 0;
 let dot=0,aa=0,bb=0,color=0;
 for(let i=0;i<256;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i]}
 for(let i=256;i<SIGNATURE_SIZE;i++)color+=Math.min(a[i],b[i]);
 return Math.max(0,Math.min(1,.9*dot/(Math.sqrt(aa*bb)||1)+.1*color/3));
}
export function matchDecision(scores:number[]){
 const sorted=[...scores].sort((a,b)=>b-a),top=sorted[0]||0;
 if(top>=.94&&(sorted.length===1||top-sorted[1]>=.035))return 'match';
 return top>=.85?'review':'none';
}
