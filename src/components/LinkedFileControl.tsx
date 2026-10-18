import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { FileCheck2, Unlink } from 'lucide-react';
import { APP } from '../config';
import { t } from '../i18n';
import type { ProjectDocument } from '../types';
import { LinkedProjectFile, projectFilePicker } from '../services/linkedFile';

export interface LinkedFileActions {connect:()=>void}
export const LinkedFileControl=forwardRef<LinkedFileActions,{document:ProjectDocument;onNotify:(message:string)=>void}>(function LinkedFileControl({document,onNotify},ref){
  const link=useRef<LinkedProjectFile|null>(null),current=useRef(document),notify=useRef(onNotify);
  const mounted=useRef(true);
  const [status,setStatus]=useState(''),[version,setVersion]=useState(0),[paused,setPaused]=useState(false),[busy,setBusy]=useState(false);
  current.current=document;notify.current=onNotify;
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;void link.current?.disconnect();};},[]);
  useEffect(()=>{
    if(link.current&&link.current.projectId!==document.data.id){link.current.disconnect();link.current=null;setStatus('');setPaused(false);}
  },[document.data.id]);
  useEffect(()=>{
    const active=link.current;if(!active||paused||active.projectId!==document.data.id)return;
    const timer=setTimeout(()=>{
      void active.save(document).then(()=>{if(link.current===active)setStatus(t('Fájlba mentve: {name}',{name:active.handle.name}));}).catch(error=>{
        if(link.current!==active)return;setPaused(true);setStatus(t('Fájlmentés szünetel'));
        notify.current(error instanceof Error?error.message:String(error));
      });
    },650);
    return ()=>clearTimeout(timer);
  },[document,version,paused]);
  const connect=async()=>{
    const picker=projectFilePicker();if(!picker||busy)return;setBusy(true);
    try{
      const snapshot=current.current;
      const name=snapshot.data.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-')||'project';
      const handle=await picker({suggestedName:`${name}${APP.extension}`,excludeAcceptAllOption:true,types:[{description:t('Teljes projektarchívum'),accept:{'application/zip':[APP.extension]}}]});
      if(!mounted.current||current.current.data.id!==snapshot.data.id)return;
      await link.current?.disconnect();link.current=null;
      const active=await LinkedProjectFile.connect(handle,current.current,()=>mounted.current&&current.current.data.id===snapshot.data.id);
      if(!mounted.current||current.current.data.id!==snapshot.data.id){active.disconnect();return;}
      link.current=active;setPaused(false);setVersion(value=>value+1);
      setStatus(t('Fájlba mentve: {name}',{name:handle.name}));
      notify.current(t('Automatikus fájlmentés bekapcsolva erre a munkamenetre.'));
    }catch(error){if(mounted.current&&!(error instanceof DOMException&&error.name==='AbortError'))notify.current(error instanceof Error?error.message:String(error));}
    finally{if(mounted.current)setBusy(false);}
  };
  useImperativeHandle(ref,()=>({connect:()=>{void connect();}}));
  if(!projectFilePicker()||!link.current&&!busy)return null;
  return <div className="linked-file-control" style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',padding:'6px 16px',borderBottom:'1px solid var(--line)'}}>
    <button className="quiet" disabled={busy} onClick={()=>void connect()}><FileCheck2 size={15}/>{t(link.current?'Másik mentési fájl…':'Automatikus mentés fájlba…')}</button>
    {link.current&&<><span role="status" className={paused?'amber-text':'subtle'}>{status}</span><button className="quiet" onClick={()=>{link.current?.disconnect();link.current=null;setStatus('');setPaused(false);setVersion(value=>value+1);}}><Unlink size={14}/>{t('Fájl leválasztása')}</button></>}
    {!link.current&&<small className="subtle">{t('Teljes .vgecko mentés, mellékletekkel; újranyitáskor válaszd ki újra.')}</small>}
  </div>;
});
