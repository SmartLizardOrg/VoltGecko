import { describe, expect, it } from 'vitest';
import { getBoardConnectionIssues, getBoardDevices, setBoardFeed } from './boardConnections';
import { createProject, deleteDevice, checkpoint, restoreRevision } from './project';
import { makeDevice } from '../catalog';
import { decodeProject, encodeProject } from './archive';

function fixture(){
  const document=createProject();
  document.data.devices=Array.from({length:4},()=>makeDevice('breaker',[])).map((device,index)=>({...device,id:`d${index}`,code:`F${index+1}`}));
  const board=document.data.boards[0];
  board.rows[0].placements=document.data.devices.map((device,index)=>({deviceId:device.id,start:index}));
  return {document,board};
}
describe('board supply documentation',()=>{
  it('detects a cycle in a disconnected component without dropping or changing any link',()=>{
    const {document,board}=fixture();
    board.connections=[{id:'a',fromDeviceId:'d0',toDeviceId:'d1'},{id:'b',fromDeviceId:'d1',toDeviceId:'d2'},{id:'c',fromDeviceId:'d2',toDeviceId:'d0'}];
    const before=structuredClone(board);
    expect(getBoardConnectionIssues(board,document.data.devices).map(issue=>issue.kind)).toContain('cycle');
    expect(board).toEqual(before);
  });
  it('reports duplicate, multiple incoming, self and missing references independently',()=>{
    const {document,board}=fixture();
    board.connections=[{id:'a',toDeviceId:'d1'},{id:'b',toDeviceId:'d1'},{id:'c',fromDeviceId:'d1',toDeviceId:'d1'},{id:'d',fromDeviceId:'missing',toDeviceId:'d2'}];
    expect(new Set(getBoardConnectionIssues(board,document.data.devices).map(issue=>issue.kind))).toEqual(new Set(['duplicate','multiple','self','missing','cycle']));
  });
  it('does not invent connections or assume a feed for old projects',()=>{
    const {document,board}=fixture();
    expect(getBoardDevices(board,document.data.devices)).toHaveLength(4);
    expect(getBoardConnectionIssues(board,document.data.devices)).toEqual([]);
    expect(board.connections).toBeUndefined();
  });
  it('replaces an explicitly edited input, rejects new cycles and preserves stable codes',()=>{
    const {document,board}=fixture();
    const first=setBoardFeed(document.data,board.id,'d0',undefined);
    const second=setBoardFeed(first,board.id,'d1','d0');
    const third=setBoardFeed(second,board.id,'d2','d1');
    expect(()=>setBoardFeed(third,board.id,'d0','d2')).toThrow('hurkot');
    expect(()=>setBoardFeed(third,board.id,'d0','d0')).toThrow('önmagát');
    expect(()=>setBoardFeed(third,board.id,'d0','missing')).toThrow('aktív elosztóban');
    const replaced=setBoardFeed(third,board.id,'d2','d0');
    expect(replaced.boards[0].connections?.filter(link=>link.toDeviceId==='d2')).toEqual([expect.objectContaining({fromDeviceId:'d0'})]);
    expect(replaced.devices.map(device=>device.code)).toEqual(['F1','F2','F3','F4']);
    expect(document.data.boards[0].connections).toBeUndefined();
  });
  it('keeps explicit graph endpoints visible after a DIN placement is removed',()=>{
    const {document,board}=fixture();
    board.rows[0].placements=[];
    board.connections=[{id:'a',fromDeviceId:'d0',toDeviceId:'d1'}];
    expect(getBoardDevices(board,document.data.devices).map(device=>device.id)).toEqual(['d0','d1']);
    const deleted=deleteDevice(document.data,'d0');
    expect(deleted.boards[0].connections).toEqual([]);
  });
  it('round-trips graph, cable and decimal power through history, restore and portable archive',async()=>{
    const {document,board}=fixture();
    board.supplyLabel='Betáp <L&N>';
    board.connections=[{id:'a',toDeviceId:'d0'},{id:'b',fromDeviceId:'d0',toDeviceId:'d1'}];
    document.data.circuits=[{id:'c',code:'C1',name:'Circuit',color:'#123456',notes:'',protectionDeviceId:'d1',cable:'NYM-J 3×2,5 mm²',powerW:1234.5,loadType:'socket'}];
    const saved=checkpoint(document,'Documented supply');
    const loaded=await decodeProject(await encodeProject(saved));
    expect(loaded).toEqual(saved);
    const restored=restoreRevision(loaded,loaded.revisions[0].id);
    expect(restored.data.boards[0].connections).toEqual(board.connections);
    expect(restored.data.circuits[0].powerW).toBe(1234.5);
    const corrupt=structuredClone(loaded);corrupt.revisions[0].data.boards[0].connections![0].toDeviceId='missing';
    await expect(encodeProject(corrupt)).rejects.toThrow('hiányzó hivatkozás');
    const invalidPower=structuredClone(loaded);invalidPower.data.circuits[0].powerW=-1;
    await expect(encodeProject(invalidPower)).rejects.toThrow('negatív');
  });
});
