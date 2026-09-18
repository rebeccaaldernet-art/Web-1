'use client';
import {useLayoutEffect,useRef,type RefObject} from 'react';
export function useLatestChat(key:string|null,loading:boolean,revision:string,viewport:RefObject<HTMLDivElement|null>,content:RefObject<HTMLDivElement|null>,following:RefObject<boolean>){
 const opened=useRef<string|null>(null);
 useLayoutEffect(()=>{
  if(!key||loading){opened.current=null;return}
  const el=viewport.current,body=content.current;if(!el||!body)return;
  if(opened.current!==key){opened.current=key;following.current=true}
  const jump=()=>{if(following.current)el.scrollTop=el.scrollHeight};
  // Initial jump happens before paint; later image/font changes keep the newest message visible.
  jump();
  const onScroll=()=>{following.current=el.scrollHeight-el.scrollTop-el.clientHeight<100};
  el.addEventListener('scroll',onScroll,{passive:true});
  const resize=new ResizeObserver(jump);resize.observe(body);resize.observe(el);
  const frame=requestAnimationFrame(jump);
  return()=>{cancelAnimationFrame(frame);resize.disconnect();el.removeEventListener('scroll',onScroll)};
 },[key,loading,revision,viewport,content,following]);
}
