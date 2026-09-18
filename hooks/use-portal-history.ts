'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortalHistory,type PortalLocation} from '@/lib/navigation-history';
export function usePortalHistory(location:PortalLocation,restore:(v:PortalLocation)=>void){
 const controller=useRef<ReturnType<typeof createPortalHistory>|null>(null),restoreRef=useRef(restore);restoreRef.current=restore;
 const [canGoBack,setCanGoBack]=useState(false);
 useEffect(()=>{const nav=createPortalHistory(window.history,window,location,v=>restoreRef.current(v),setCanGoBack,crypto.randomUUID());controller.current=nav;return()=>{nav.dispose();controller.current=null}},[]);
 useEffect(()=>{controller.current?.record(location)},[location.view,location.channel,location.thread]);
 return {canGoBack,goBack:()=>controller.current?.back()};
}
