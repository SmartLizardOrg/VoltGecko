import { afterEach, describe, expect, it } from 'vitest';
import { decodeProject, encodeProject, validateProject } from '../data/archive';
import { getBoardIssues } from '../data/project';
import { setLanguage } from '../i18n';
import enLegacyBoardV3 from '../locales/en-legacy-board-v3';
import { importLegacyBoard, isLegacyBoard } from './legacyBoard';

function sample() {
  return {
    v:3,rev:9,nid:90,
    project:{name:'Example <board>',author:'Example author',date:'2026-10-18',demand:0.8,fileName:'example.json'},
    boxes:[
      {name:'Main',busPos:'bottom',bus:{n:4,pe:4},bu:{n:['Incoming','Spare'],pe:['Earth']}},
      {name:'Sub board',busPos:'top',bus:{n:3,pe:3},bu:{n:['Protected N'],pe:['Remote PE']}},
    ],
    rows:[{mods:18,box:0,bar:'L2',barN:8},{mods:12,box:1,bar:'L1',barN:6}],
    comps:[
      {id:'main',type:'rccb',poles:'2P',row:0,x:0,nLeft:true,rating:40,sens:30,rtype:'A',name:'Main RCD',tag:'FI-A'},
      {id:'terminal',type:'terminal',poles:'1P',row:0,x:3.25,tcol:'PE',group:'feed',name:'Earth terminal',
        infeed:{kind:'earth',name:'Earth electrode',poles:'1P',side:'top',conductors:[{p:1,color:'gy'}],entry:{x:8,row:0,dx:3,top:true},off:{'1':12}}},
      {id:'load',type:'mcb',poles:'1P',row:0,x:6,rating:16,curve:'B',name:'Combined load',kmsz:7,nos:'21, 22',consumers:'Lighting and sockets',phase:'L2',power:450,cable:'Cu NYM-J 3×2,5 mm²',ctype:'NYM-J',cores:'3',cs:'2,5',mat:'Cu',length:'12',loadType:'socket'},
      {id:'motor',type:'mpcb',poles:'3P',row:1,x:0,name:'Motor',rating:3.2,phase:'',power:'',loadType:'motor'},
      {id:'meter',type:'meter',poles:'3P+N',row:1,x:3,name:'Meter'},
      {id:'remote',type:'terminal',poles:'3P+N+PE',row:1,x:9,name:'Remote terminal'},
    ],
    wires:[
      {id:'w1',a:{c:'main',s:'top',p:0},b:{c:'terminal',s:'top',p:1},color:'gy',cores:'1',cs:'4',mat:'Alu',length:25,cable:'Alu 1×4 mm²',via:'left',lx:25,ly:20,off:{'1':8,'2':-4}},
      {id:'w2',a:{c:'terminal',s:'bottom',p:0},b:{c:'remote',s:'top',p:4},color:'gy'},
      {id:'w3',a:{c:'load',s:'top'},b:{c:'main',s:'bottom',p:1}},
    ],
    bw:[{id:'bw1',c:'load'},{id:'bw2',c:'main',p:1,feed:true}],
    bb:[
      {id:'bb1',c:'main',s:'top',p:1,bus:'row',row:1,k:2},
      {id:'bb2',c:'terminal',s:'bottom',p:1,bus:'pe',box:1,k:0,lx:50},
      {id:'bb3',s:'top',bus:'n',box:1,k:2,cable:'Cu 1×4 mm²',ext:{x:11.5,row:1,title:'Solar N',label:'Inverter',edge:'right',dy:10}},
    ],
    lo:{'in:terminal':{dx:8,dy:-10},'ext:bb3':{dx:4,dy:9},'box:1':{dx:1,dy:2}},
  };
}
afterEach(()=>setLanguage('hu'));

describe('legacy board JSON v3 import',()=>{
  it('recognizes v3 including malformed files and preserves the complete original snapshot without mutating it',()=>{
    const input=sample(),before=structuredClone(input);
    expect(isLegacyBoard(input)).toBe(true);expect(isLegacyBoard({v:3,rows:'broken'})).toBe(true);expect(isLegacyBoard({v:3,other:[]})).toBe(false);
    const doc=importLegacyBoard(input);validateProject(doc);
    expect(input).toEqual(before);expect(doc.data.boards[0].wiring!.source).toEqual(input);
    expect(doc.data.boards[0].wiring!.source).not.toBe(input);
    expect(doc.data.boards.map(board=>board.name)).toEqual(['Main','Sub board']);
    expect(doc.data.boards.map(board=>board.rows.map(row=>row.capacity))).toEqual([[18],[12]]);
    expect(doc.data.boards.every(board=>board.connections?.length===0)).toBe(true);
  });

  it('keeps device identities, source codes, electrical fields, exact fractional positions and recoverable overhangs',()=>{
    const doc=importLegacyBoard(sample()),devices=doc.data.devices;
    expect(devices.map(d=>d.electrical?.originalId)).toEqual(['main','terminal','load','motor','meter','remote']);
    expect(devices.map(d=>d.kind)).toEqual(['rcd','custom','breaker','custom','custom','custom']);
    expect(devices.map(d=>d.moduleWidth)).toEqual([2,29/17.5,1,3,6,9]);
    expect(devices[0].code).toBe('FI-A');expect(devices[2].code).toBe('F7');
    expect(devices[0].electrical).toMatchObject({poles:['N','L'],currentA:40,residualCurrentMa:30,residualType:'A'});
    expect(devices[1].electrical).toMatchObject({poles:['PE','PE'],group:'feed',role:'terminal',commonPoleGroups:[[0,1]]});
    expect(devices.filter(d=>d.electrical?.role!=='terminal').every(d=>d.electrical?.commonPoleGroups===undefined)).toBe(true);
    expect(devices[2].electrical).toMatchObject({circuitNumbers:'21, 22',consumers:'Lighting and sockets',phase:'L2'});
    expect(doc.data.boards[0].rows[0].placements[1].start).toBe(3.25);
    expect(doc.data.boards[1].rows[0].placements.at(-1)?.start).toBe(9);
    expect(getBoardIssues(doc.data.boards[1],devices).some(issue=>issue.message.includes('túllóg'))).toBe(true);
  });

  it('retains every explicit device, bus, cross-board and infeed wire without inferring power edges',()=>{
    const input=sample(),doc=importLegacyBoard(input),boards=doc.data.boards,all=boards.flatMap(board=>board.wiring!.wires);
    expect(all).toHaveLength(input.wires.length+input.bw.length+input.bb.length+1);
    expect(new Set(all.map(wire=>wire.id)).size).toBe(all.length);
    const explicit=all.find(wire=>wire.sourceRoute?.id==='w1')!;
    expect(explicit.from).toMatchObject({kind:'device',deviceId:doc.data.devices[0].id,side:'top',pole:0});
    expect(explicit.to).toMatchObject({kind:'device',deviceId:doc.data.devices[1].id,side:'top',pole:1});
    expect(explicit.color).toBe('#26833b');expect(explicit.sourceRoute).toEqual(input.wires[0]);
    expect(explicit.cable).toEqual({designation:'Alu 1×4 mm²',cores:1,crossSectionMm2:4,material:'Al',lengthM:25});
    const crossBoard=all.find(wire=>wire.sourceRoute?.id==='w2')!;
    expect(crossBoard.to).toMatchObject({kind:'device',deviceId:doc.data.devices[5].id,pole:4});
    const infeed=boards[0].wiring!.infeeds[0];expect(infeed).toMatchObject({kind:'earth',poles:['PE'],labelOffset:{x:8,y:-10}});
    expect(infeed.position).toBeUndefined();
    const inWire=all.find(wire=>wire.sourceRoute?.componentId==='terminal')!;
    expect(inWire.sourceRoute?.entry).toEqual(input.comps[1].infeed!.entry);
    expect(inWire.to).toMatchObject({kind:'device',pole:1});
    expect(boards[1].wiring!.infeeds[0]).toMatchObject({name:'Solar N',poles:['N'],labelOffset:{x:4,y:9}});
    expect(boards[0].wiring!.buses.find(bus=>bus.conductor==='PE')).toMatchObject({capacity:4,position:'bottom',terminalLabels:['Earth','','','']});
    expect(all.find(wire=>wire.sourceRoute?.id==='bb1')?.to).toMatchObject({kind:'bus',terminal:2});
  });

  it('keeps aggregate circuit labels together without inventing loads from their numbers',()=>{
    const doc=importLegacyBoard(sample()),circuit=doc.data.circuits.find(item=>item.code==='F7')!;
    expect(doc.data.circuits).toHaveLength(2);expect(circuit.powerW).toBe(450);
    expect(circuit.cableDetails).toEqual({designation:'Cu NYM-J 3×2,5 mm²',cores:3,crossSectionMm2:2.5,material:'Cu',lengthM:12});
    expect(circuit.notes).toContain('Lighting and sockets');expect(circuit.phase).toBe('L2');
  });

  it('imports genuine separate circuits sharing the same protection without duplicating aggregate demand',()=>{
    const input=sample();const load={...input.comps[2],circuits:[
      {no:21,name:'Lighting',power:100,cable:'Cu 3×1,5 mm²',cs:'1,5',mat:'Cu',length:9,phase:'L2',loadType:'lamp',devices:['Hall','Office']},
      {no:22,name:'Sockets',power:350,cable:'Cu 3×2,5 mm²',cs:'2,5',mat:'Cu',length:12,phase:'L2',loadType:'socket',devices:[{name:'Socket A',count:2}]},
    ]};
    const doc=importLegacyBoard({...input,comps:input.comps.map(c=>c.id==='load'?load:c)}),device=doc.data.devices[2];
    const circuits=doc.data.circuits.filter(c=>c.protectionDeviceId===device.id);
    expect(circuits.map(c=>[c.code,c.name,c.powerW])).toEqual([['21','Lighting',100],['22','Sockets',350]]);
    expect(circuits.reduce((sum,c)=>sum+(c.powerW??0),0)).toBe(450);
    expect(circuits[0].notes).toContain('Hall');expect(circuits[1].notes).toContain('Socket A');validateProject(doc);
  });

  it('honours an explicitly empty circuits list without manufacturing an aggregate load',()=>{
    const input=sample();const doc=importLegacyBoard({...input,comps:input.comps.map(c=>c.id==='load'?{...c,circuits:[]}:c)});
    const device=doc.data.devices.find(d=>d.electrical?.originalId==='load')!;
    expect(device.circuitId).toBeUndefined();expect(doc.data.circuits.some(c=>c.protectionDeviceId===device.id)).toBe(false);
    expect(device.electrical?.circuitNumbers).toBe('21, 22');
  });

  it('preserves cycles, self links and parallel explicit conductors without selecting a tree',()=>{
    const input=sample();const doc=importLegacyBoard({...input,wires:[...input.wires,
      {id:'loop',a:{c:'load',s:'bottom',p:0},b:{c:'main',s:'top',p:1}},
      {id:'self',a:{c:'terminal',s:'top',p:0},b:{c:'terminal',s:'top',p:1}},
      {...input.wires[0],id:'parallel'},
    ]});
    const all=doc.data.boards.flatMap(b=>b.wiring!.wires);expect(all).toHaveLength(12);
    expect(all.filter(w=>w.sourceRoute?.id==='self')).toHaveLength(1);expect(all.filter(w=>w.sourceRoute?.id==='parallel')).toHaveLength(1);
    expect(doc.data.boards.every(b=>b.connections?.length===0)).toBe(true);validateProject(doc);
  });

  it('expands only implicit three-phase bundles and retains unresolved multi-pole endpoints explicitly',()=>{
    const input=sample();const doc=importLegacyBoard({...input,wires:[
      {id:'three',a:{c:'motor',s:'top'},b:{c:'meter',s:'bottom'},colors:['#123456','#654321','#789abc']},
      {id:'unspecified',a:{c:'main',s:'top'},b:{c:'terminal',s:'bottom',p:0}},
    ]});
    const all=doc.data.boards.flatMap(b=>b.wiring!.wires),bundle=all.filter(w=>w.sourceRoute?.id==='three');
    expect(bundle.map(w=>w.from.kind==='device'?w.from.pole:null)).toEqual([0,1,2]);expect(bundle.map(w=>w.color)).toEqual(['#123456','#654321','#789abc']);
    const unresolved=all.find(w=>w.sourceRoute?.id==='unspecified')!;expect(unresolved.from).not.toHaveProperty('pole');
    validateProject(doc);
  });

  it('does not run old revision migrations or infer an SPD-earth link or change cable material',()=>{
    const input=sample();const doc=importLegacyBoard({...input,rev:0});
    expect(doc.data.boards.flatMap(b=>b.wiring!.wires)).toHaveLength(9);
    expect(doc.data.boards.flatMap(b=>b.wiring!.infeeds)).toHaveLength(2);
    expect(doc.data.boards[0].wiring!.wires.find(w=>w.sourceRoute?.id==='w1')?.cable?.material).toBe('Al');
    expect(doc.data.boards[0].wiring!.source?.rev).toBe(0);
  });

  it('round-trips structured wiring, sources and history through the portable archive',async()=>{
    const doc=importLegacyBoard(sample());expect(await decodeProject(await encodeProject(doc))).toEqual(doc);
  });

  it('rejects malformed references and specifications atomically rather than dropping records',()=>{
    const input=sample();
    for(const invalid of [
      {...input,comps:[...input.comps,{...input.comps[0]}]},
      {...input,wires:[{...input.wires[0],a:{c:'missing',s:'top',p:0}}]},
      {...input,wires:[{...input.wires[0],a:{c:'main',s:'top',p:2}}]},
      {...input,wires:[{...input.wires[0],color:'url(javascript:bad)'}]},
      {...input,bw:[{id:'w1',c:'load'}]},
      {...input,bb:[{id:'bad',c:'main',s:'top',p:0,bus:'pe',box:1,k:10}]},
      {...input,rows:[{...input.rows[0],box:2}]},
      {...input,comps:[{...input.comps[0],type:'unknown'}]},
      {...input,comps:[{...input.comps[0],sens:NaN}]},
      {...input,comps:[{...input.comps[0],nLeft:true,neutralLeft:false}]},
      {...input,project:{...input.project,demand:2}},
      {...input,unknown:'future feature'},
    ])expect(()=>importLegacyBoard(invalid)).toThrow();
    expect(()=>importLegacyBoard({...input,comps:[{...input.comps[0],row:2}]})).toThrow('comps[0].row');
    expect(()=>importLegacyBoard({...input,wires:[{...input.wires[0],b:{c:'missing',s:'top'}}]})).toThrow('hiányzó készülék');
    expect(input).toEqual(sample());
  });

  it('handles prototype-like source IDs as inert identifiers and creates fresh shared identities',()=>{
    const input=sample();const renamed={...input,comps:input.comps.map(c=>c.id==='main'?{...c,id:'__proto__'}:c),wires:[],bw:[],bb:[]};
    const one=importLegacyBoard(renamed),two=importLegacyBoard(renamed);
    expect(one.data.devices[0].electrical?.originalId).toBe('__proto__');expect(one.data.devices[0].id).not.toBe(two.data.devices[0].id);
    expect(one.data.boards[0].wiring!.source).toEqual(renamed);validateProject(one);
  });

  it('provides matching English translation placeholders',()=>{
    const placeholders=(text:string)=>[...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(match=>match[1]).sort();
    for(const [hu,en]of Object.entries(enLegacyBoardV3))expect(placeholders(en),hu).toEqual(placeholders(hu));
  });
});
