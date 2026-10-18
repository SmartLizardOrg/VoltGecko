import { describe, expect, it } from 'vitest';
import { decodeProject } from '../data/archive';
import { createProject } from '../data/project';
import { LinkedFileConflict, LinkedProjectFile, type WritableProjectFile } from './linkedFile';

function memoryFile(){
  let bytes=new Blob();let writes=0;
  const handle:WritableProjectFile={name:'project.vgecko',async getFile(){return bytes;},async createWritable(){let staged:Blob;return {async write(next){staged=next;},async close(){bytes=staged;writes++;},async abort(){}};}};
  return {handle,edit(next:Blob){bytes=next;},get bytes(){return bytes;},get writes(){return writes;}};
}
describe('explicit linked project archive',()=>{
  it('serializes concurrent complete snapshots with assets and revisions intact',async()=>{
    const file=memoryFile(),doc=createProject('First');const linked=await LinkedProjectFile.connect(file.handle,doc);
    const second=structuredClone(doc);second.data.name='Second';const third=structuredClone(doc);third.data.name='Third';
    await Promise.all([linked.save(second),linked.save(third)]);
    expect((await decodeProject(file.bytes)).data.name).toBe('Third');expect(file.writes).toBe(3);
  });
  it('pauses on any external byte change, even with no timestamp difference, and never retries over it',async()=>{
    const file=memoryFile(),doc=createProject();const linked=await LinkedProjectFile.connect(file.handle,doc);
    const external=new Blob(['external content']);file.edit(external);
    await expect(linked.save(doc)).rejects.toBeInstanceOf(LinkedFileConflict);
    await expect(linked.save(doc)).rejects.toBeInstanceOf(LinkedFileConflict);
    expect(file.bytes).toBe(external);expect(file.writes).toBe(1);
  });
  it('cannot write another project and stops queued writes after disconnect',async()=>{
    const file=memoryFile(),doc=createProject();const linked=await LinkedProjectFile.connect(file.handle,doc);
    await expect(linked.save(createProject())).rejects.toThrow('másik projekthez');
    linked.disconnect();await linked.save(doc);expect(file.writes).toBe(1);
  });
  it('does not write a project after its picker owner has been unmounted',async()=>{
    const file=memoryFile(),doc=createProject();let active=true,calls=0;
    const original=file.handle.getFile;file.handle.getFile=async()=>{if(++calls===2)active=false;return original();};
    await LinkedProjectFile.connect(file.handle,doc,()=>active);
    expect(file.writes).toBe(0);
  });
});
