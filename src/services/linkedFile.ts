import { encodeProject } from '../data/archive';
import { t } from '../i18n';
import type { ProjectDocument } from '../types';

export interface WritableProjectFile {
  name:string;
  getFile():Promise<Blob>;
  createWritable():Promise<{write(data:Blob):Promise<void>;close():Promise<void>;abort?():Promise<void>}>;
}
export class LinkedFileConflict extends Error {
  constructor(){super(t('A kapcsolt fájl kívülről megváltozott. Az automatikus mentés szünetel.'));}
}
const fingerprint=async(blob:Blob):Promise<string>=>{
  const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
};

/** Session-only, explicitly selected complete archives. Writes are serialized and
 * compare file contents, never a timestamp tolerance or a shared global handle. */
export class LinkedProjectFile {
  private expected='';
  private queue:Promise<void>=Promise.resolve();
  private paused=false;
  private closed=false;
  private constructor(readonly handle:WritableProjectFile,readonly projectId:string,private readonly active:()=>boolean){}
  static async connect(handle:WritableProjectFile,document:ProjectDocument,active:()=>boolean=()=>true):Promise<LinkedProjectFile>{
    const linked=new LinkedProjectFile(handle,document.data.id,active);
    linked.expected=await fingerprint(await handle.getFile());
    await linked.save(document);
    return linked;
  }
  disconnect():Promise<void>{this.closed=true;return this.queue;}
  save(document:ProjectDocument):Promise<void>{
    const snapshot=structuredClone(document);
    const operation=this.queue.then(async()=>{
      if(this.closed||!this.active())return;
      if(snapshot.data.id!==this.projectId)throw new Error(t('A kapcsolt fájl másik projekthez tartozik.'));
      if(this.paused)throw new LinkedFileConflict();
      const archive=await encodeProject(snapshot);
      if(this.closed||!this.active())return;
      if(await fingerprint(await this.handle.getFile())!==this.expected){this.paused=true;throw new LinkedFileConflict();}
      const writer=await this.handle.createWritable();
      try{
        // Detect a change made while the browser was acquiring its writable handle.
        if(await fingerprint(await this.handle.getFile())!==this.expected){this.paused=true;throw new LinkedFileConflict();}
        if(this.closed||!this.active()){await writer.abort?.();return;}
        await writer.write(archive);await writer.close();
        // Remember OUR bytes, so an external edit after close is detected next time.
        this.expected=await fingerprint(archive);
      }catch(error){await writer.abort?.().catch(()=>{});throw error;}
    });
    this.queue=operation.catch(()=>{});
    return operation;
  }
}

export function projectFilePicker():((options:unknown)=>Promise<WritableProjectFile>)|undefined{
  return (window as unknown as {showSaveFilePicker?:(options:unknown)=>Promise<WritableProjectFile>}).showSaveFilePicker?.bind(window);
}
