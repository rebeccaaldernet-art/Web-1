export type MessagePart={text:string;href?:string};
export function messageLinks(body:string):MessagePart[]{
 const parts:MessagePart[]=[];
 const pattern=/(?<![\w@/])(?:https?:\/\/[^\s<>"']+|(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#][^\s<>"']*)?)/gi;
 let cursor=0;
 for(const match of body.matchAll(pattern)){
  let label=match[0].replace(/[.,!?;:]+$/g,'');
  for(const [open,close] of [['(',')'],['[',']'],['{','}']]){
   while(label.endsWith(close)&&label.split(close).length>label.split(open).length)label=label.slice(0,-1);
  }
  let url:URL;try{url=new URL(/^https?:\/\//i.test(label)?label:'https://'+label)}catch{continue}
  if(!['https:','http:'].includes(url.protocol)||!url.hostname)continue;
  const start=match.index!;
  if(start>cursor)parts.push({text:body.slice(cursor,start)});
  parts.push({text:label,href:url.href});cursor=start+label.length;
 }
 if(cursor<body.length)parts.push({text:body.slice(cursor)});
 return parts;
}
