import { makeDevice, uid } from '../catalog';
import { checkpoint, createProject } from '../data/project';
import { validateProject } from '../data/archive';
import { t } from '../i18n';
import type { Board, BoardInfeed, BoardWire, CableDetails, Circuit, Conductor, DeviceElectrical, DeviceKind, Phase, ProjectDocument, WiringEndpoint } from '../types';

type Raw = Record<string, unknown>;
type Pole = '1P'|'1P+N'|'2P'|'3P'|'3P+N'|'4P'|'3P+N+PE';
type Role = NonNullable<DeviceElectrical['role']>;
interface SourceCable { cable?:string; ctype?:string; cores?:number|string; cs?:number|string; mat?:string; length?:number|string }
interface SourceInfeed extends SourceCable {
  name?:string; poles?:Pole; kind?:'earth'|'supply'; side?:'top'|'bottom';
  conductors?:{p:number; color?:string}[]; entry?:{row?:number; x:number; dx?:number; top?:boolean};
}
interface SourceCircuit extends SourceCable { no:number|string; name?:string; power?:number|string; phase?:Phase|''; loadType?:string; consumers?:string; devices?:unknown[] }
interface Component extends SourceCable {
  id:string; type:Role; row:number; x:number; poles:Pole; rating?:number; sens?:number;
  curve?:string; rtype?:string; cls?:string; name?:string; phase?:Phase|''; group?:string;
  tag?:string; kmsz?:number|string; nos?:string; consumers?:string; tcol?:Conductor;
  nLeft?:boolean; neutralLeft?:boolean; power?:number|string; loadType?:string;
  infeed?:SourceInfeed; circuits?:SourceCircuit[];
}
interface Endpoint { c:string; s:'top'|'bottom'; p?:number }
interface SourceWire extends SourceCable { id:string; a:Endpoint; b:Endpoint; color?:string; colors?:string[] }
interface SourceTap extends SourceCable { id:string; c:string; p?:number; color?:string; feed?:boolean }
interface SourceBusWire extends SourceCable {
  id:string; c?:string; s?:'top'|'bottom'; p?:number; bus:'n'|'pe'|'row'; box?:number; row?:number; k?:number; color?:string;
  ext?:{x:number; row:number; label?:string; title?:string; dy?:number; edge?:string};
}
interface SourceBox { name:string; busPos?:'top'|'bottom'; bus?:{n?:number; pe?:number}; bu?:{n?:string[]; pe?:string[]} }
interface Source {
  v:3; rev?:number; project:{name:string; author?:string; date?:string; demand?:number};
  boxes?:SourceBox[]; rows:{mods:number; box?:number; bar?:Phase|''; barN?:number}[];
  bus?:SourceBox['bus']; bu?:SourceBox['bu']; comps:Component[]; wires:SourceWire[];
  bw?:SourceTap[]; bb?:SourceBusWire[]; lo?:Record<string,{dx:number;dy:number}>;
}

const definitions: Record<Role, {kind:DeviceKind;prefix:string;label:string}> = {
  supply:{kind:'custom',prefix:'T',label:'Betáplálás'}, main:{kind:'main',prefix:'Q',label:'Főkapcsoló'},
  mcb:{kind:'breaker',prefix:'F',label:'Kismegszakító'}, rccb:{kind:'rcd',prefix:'FI',label:'ÁVK'},
  rcbo:{kind:'rcbo',prefix:'F',label:'ÁVK-kismegszakító'}, spd:{kind:'spd',prefix:'SPD',label:'Túlfeszültség-védelem'},
  contactor:{kind:'relay',prefix:'K',label:'Kontaktor'}, meter:{kind:'custom',prefix:'WH',label:'Fogyasztásmérő'},
  terminal:{kind:'custom',prefix:'X',label:'Főági sorkapocs'}, mpcb:{kind:'custom',prefix:'MVK',label:'Motorvédő kapcsoló'},
  outlet:{kind:'outlet',prefix:'XS',label:'Dugalj'},
};
const widths: Record<Pole,number> = {'1P':1,'1P+N':2,'2P':2,'3P':3,'3P+N':4,'4P':4,'3P+N+PE':4};
const specialWidths: Partial<Record<Role,Partial<Record<Pole,number>>>> = {
  contactor:{'2P':2,'4P':3}, meter:{'1P+N':4,'3P+N':6},
  terminal:{'1P':29/17.5,'1P+N':4,'3P+N':7,'3P+N+PE':9},
};
const supportedPoles:Record<Role,Pole[]>={
  supply:['1P+N','3P+N'],main:['2P','3P','4P'],mcb:['1P','1P+N','3P','3P+N'],rccb:['2P','4P'],
  rcbo:['1P+N','3P+N'],spd:['1P+N','3P+N'],contactor:['2P','4P'],meter:['1P+N','3P+N'],
  terminal:['1P','1P+N','3P+N','3P+N+PE'],mpcb:['1P+N','3P'],outlet:['1P+N'],
};
const phases = ['L1','L2','L3'] as const;
const conductorNames:Conductor[] = ['L','L1','L2','L3','N','PE','PEN'];
const wireColors:Record<Conductor,string> = {L:'#7a4a1e',L1:'#7a4a1e',L2:'#1c1c1c',L3:'#8a8f95',N:'#2d6fd3',PE:'gy',PEN:'gy'};
const circuitColors = ['#376fd0','#d59a28','#9e68bc','#19998b','#ce6986','#64748b'];
const cableKeys = ['cable','ctype','cores','cs','mat','length'];
const routeKeys = ['via','lx','ly','off'];
const loadRoles = new Set<Role>(['mcb','rcbo','contactor','mpcb','outlet']);

function fail(path:string, message:string):never {
  throw new Error(t('Érvénytelen elosztó JSON: {message}',{message:`${path}: ${t(message)}`}));
}
function object(value:unknown,path:string):asserts value is Raw {
  if (!value || typeof value!=='object' || Array.isArray(value)) fail(path,'objektum szükséges.');
}
function keys(value:Raw,allowed:readonly string[],path:string) {
  const field=Object.keys(value).find(key=>!allowed.includes(key));
  if(field) fail(path,t('nem támogatott mező ({field}); az import megszakadt az adatvesztés elkerülésére.',{field}));
}
function string(value:unknown,path:string,max=5000):asserts value is string {
  if(typeof value!=='string'||value.length>max)fail(path,'hibás vagy túl hosszú szöveg.');
}
function textFields(value:Raw,fields:readonly string[],path:string,max=5000) {
  fields.forEach(key=>{if(value[key]!==undefined)string(value[key],`${path}.${key}`,max);});
}
function numeric(value:unknown,path:string,min:number,max:number,integer=false):asserts value is number {
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))fail(path,'hibás vagy határon kívüli szám.');
}
function numericText(value:unknown,path:string,min=0,max=1_000_000_000,integer=false) {
  if(value===undefined||value==='')return;
  const num=typeof value==='string'&&/^\d+(?:[.,]\d+)?$/.test(value.trim())?Number(value.trim().replace(',','.')):value;
  numeric(num,path,min,max,integer);
}
function list(value:unknown,path:string,max=20_000):asserts value is unknown[] {
  if(!Array.isArray(value)||value.length>max)fail(path,'hibás vagy túl hosszú lista.');
}
function boolean(value:unknown,path:string) {if(value!==undefined&&typeof value!=='boolean')fail(path,'logikai érték szükséges.');}
function identifier(value:unknown,path:string):asserts value is string {
  string(value,path,200);if(!value.trim()||/[\u0000-\u001f\u007f]/.test(value))fail(path,'hibás azonosító.');
}
function color(value:unknown,path:string) {
  if(value!==undefined&&(typeof value!=='string'||!(/^(?:#[0-9a-f]{6}|gy)$/i.test(value))))fail(path,'hibás vezetékszín.');
}
function phase(value:unknown,path:string) {if(value!==undefined&&value!==''&&!phases.includes(value as Phase))fail(path,'ismeretlen fázis.');}
function pole(value:unknown,path:string):asserts value is Pole {if(typeof value!=='string'||!Object.hasOwn(widths,value))fail(path,'ismeretlen pólusszám.');}
function side(value:unknown,path:string):asserts value is 'top'|'bottom' {if(value!=='top'&&value!=='bottom')fail(path,'ismeretlen kapocsoldal.');}
function unique(value:unknown[],path:string,seen=new Set<string>()) {
  value.forEach((entry,index)=>{object(entry,`${path}[${index}]`);identifier(entry.id,`${path}[${index}].id`);if(seen.has(entry.id))fail(path,t('ismétlődő azonosító ({id}).',{id:entry.id}));seen.add(entry.id);});
  return seen;
}
function cable(value:Raw,path:string) {
  textFields(value,['cable','ctype','mat'],path);
  numericText(value.cores,`${path}.cores`,1,1000,true);numericText(value.cs,`${path}.cs`,0.0001,100_000);
  numericText(value.length,`${path}.length`,0,1_000_000);
  if(value.mat!==undefined&&!['','Cu','Al','Alu'].includes(value.mat as string))fail(`${path}.mat`,'ismeretlen vezetőanyag.');
}
function route(value:Raw,path:string) {
  if(value.via!==undefined&&value.via!=='left')fail(`${path}.via`,'ismeretlen útvonal.');
  ['lx','ly'].forEach(key=>{if(value[key]!==undefined)numeric(value[key],`${path}.${key}`,-1_000_000,1_000_000);});
  if(value.off!==undefined) {
    object(value.off,`${path}.off`);
    if(Object.keys(value.off).length>10_000)fail(`${path}.off`,'hibás vagy túl hosszú lista.');
    for(const [key,offset]of Object.entries(value.off)) {
      if(!/^\d+$/.test(key))fail(`${path}.off.${key}`,'hibás útvonalszakasz.');
      numeric(offset,`${path}.off.${key}`,-1_000_000,1_000_000);
    }
  }
}
function polesOf(component:Component):Conductor[] {
  if(component.type==='terminal') {
    if(component.poles==='1P')return [component.tcol??'L',component.tcol??'L'];
    return component.poles==='1P+N'?['L','N']:['L1','L2','L3','N',...(component.poles==='3P+N+PE'?['PE' as const]:[])];
  }
  if(['3P','3P+N','4P','3P+N+PE'].includes(component.poles))return ['L1','L2','L3',...(/N|4P/.test(component.poles)?['N' as const]:[]),...(component.poles==='3P+N+PE'?['PE' as const]:[])];
  if(component.poles==='1P+N'||component.poles==='2P')return component.nLeft||component.neutralLeft?['N','L']:['L','N'];
  return ['L'];
}
function endpoint(value:unknown,path:string,components:Map<string,Component>) {
  object(value,path);keys(value,['c','s','p'],path);identifier(value.c,`${path}.c`);
  const c=components.get(value.c);if(!c)fail(path,t('hiányzó készülék ({id}).',{id:value.c}));
  side(value.s,`${path}.s`);
  if(value.p!==undefined)numeric(value.p,`${path}.p`,0,polesOf(c).length-1,true);
}

function validate(value:unknown):asserts value is Source {
  object(value,'JSON');keys(value,['v','rev','project','boxes','rows','comps','wires','bw','bb','nid','lo','bus','bu'],'JSON');
  if(value.v!==3)fail('v','csak az elosztótervező 3-as JSON-változata támogatott.');
  if(value.rev!==undefined)numeric(value.rev,'rev',0,Number.MAX_SAFE_INTEGER,true);
  if(value.nid!==undefined)numeric(value.nid,'nid',0,Number.MAX_SAFE_INTEGER,true);
  object(value.project,'project');keys(value.project,['name','author','date','demand','fileName'],'project');string(value.project.name,'project.name',1000);
  textFields(value.project,['author','date','fileName'],'project',1000);
  if(value.project.demand!==undefined)numeric(value.project.demand,'project.demand',0,1);
  const boxes=value.boxes===undefined?[{name:value.project.name,bus:value.bus,bu:value.bu}]:value.boxes;
  list(boxes,'boxes',1000);if(!boxes.length)fail('boxes','legalább egy elosztó szükséges.');
  boxes.forEach((box,index)=>{
    const path=`boxes[${index}]`;object(box,path);keys(box,['name','busPos','bus','bu'],path);string(box.name,`${path}.name`,1000);
    if(box.busPos!==undefined)side(box.busPos,`${path}.busPos`);
    if(box.bus!==undefined) {
      object(box.bus,`${path}.bus`);keys(box.bus,['n','pe'],`${path}.bus`);
      for(const key of ['n','pe'])if(box.bus[key]!==undefined)numeric(box.bus[key],`${path}.bus.${key}`,0,100_000,true);
    }
    if(box.bu!==undefined) {
      object(box.bu,`${path}.bu`);keys(box.bu,['n','pe'],`${path}.bu`);
      for(const key of ['n','pe'])if(box.bu[key]!==undefined) {
        list(box.bu[key],`${path}.bu.${key}`,100_000);box.bu[key].forEach((label,i)=>string(label,`${path}.bu.${key}[${i}]`));
        if(box.bu[key].length>Number((box.bus as Raw|undefined)?.[key]??0))fail(`${path}.bu.${key}`,'a kapocscímkék száma nagyobb a sín kapacitásánál.');
        if(box.bu[key].length&&!((box.bus as Raw|undefined)?.[key]))fail(`${path}.bu.${key}`,'hiányzó sín.');
      }
    }
  });
  list(value.rows,'rows',1000);const rows=value.rows;if(!rows.length)fail('rows','legalább egy elosztósor szükséges.');
  rows.forEach((row,index)=>{
    const path=`rows[${index}]`;object(row,path);keys(row,['mods','bar','box','barN'],path);numeric(row.mods,`${path}.mods`,1,100_000,true);
    if(row.box!==undefined)numeric(row.box,`${path}.box`,0,boxes.length-1,true);phase(row.bar,`${path}.bar`);
    if(row.barN!==undefined)numeric(row.barN,`${path}.barN`,1,row.mods,true);
  });
  list(value.comps,'comps');unique(value.comps,'comps');
  value.comps.forEach((component,index)=>{
    const path=`comps[${index}]`;object(component,path);
    keys(component,['id','type','row','x','poles','rating','sens','curve','rtype','cls','name','phase','group','tag','kmsz','nos','consumers','tcol','nLeft','neutralLeft','power','loadType','infeed','circuits','ocol','nolabel',...cableKeys,...routeKeys],path);
    if(typeof component.type!=='string'||!Object.hasOwn(definitions,component.type))fail(`${path}.type`,'ismeretlen készüléktípus.');
    pole(component.poles,`${path}.poles`);if(!supportedPoles[component.type as Role].includes(component.poles))fail(`${path}.poles`,'a póluskiosztás nem támogatott ennél a készüléktípusnál.');
    numeric(component.row,`${path}.row`,0,rows.length-1,true);numeric(component.x,`${path}.x`,-100_000,100_000);
    for(const key of ['rating','sens'])if(component[key]!==undefined)numeric(component[key],`${path}.${key}`,0.000001,1_000_000);
    textFields(component,['curve','rtype','cls','name','group','tag','nos','consumers','loadType'],path);
    if(component.kmsz!==undefined&&typeof component.kmsz!=='number')string(component.kmsz,`${path}.kmsz`,100);
    else if(component.kmsz!==undefined)numeric(component.kmsz,`${path}.kmsz`,0,1_000_000,true);
    boolean(component.nLeft,`${path}.nLeft`);boolean(component.neutralLeft,`${path}.neutralLeft`);boolean(component.nolabel,`${path}.nolabel`);
    if(component.nLeft!==undefined&&component.neutralLeft!==undefined&&component.nLeft!==component.neutralLeft)fail(path,'ellentmondó nullavezető-pozíció.');
    if(component.tcol!==undefined&&!conductorNames.includes(component.tcol as Conductor))fail(`${path}.tcol`,'ismeretlen vezető.');
    numericText(component.power,`${path}.power`);phase(component.phase,`${path}.phase`);color(component.ocol,`${path}.ocol`);cable(component,path);route(component,path);
    if(component.infeed!==undefined) {
      const path2=`${path}.infeed`;object(component.infeed,path2);const inf=component.infeed;
      keys(inf,['name','poles','kind','side','conductors','entry','nolabel',...cableKeys,...routeKeys],path2);
      textFields(inf,['name'],path2);if(inf.poles!==undefined)pole(inf.poles,`${path2}.poles`);
      if(inf.kind!==undefined&&!['earth','supply'].includes(inf.kind as string))fail(`${path2}.kind`,'ismeretlen betáplálástípus.');
      if(inf.side!==undefined)side(inf.side,`${path2}.side`);boolean(inf.nolabel,`${path2}.nolabel`);cable(inf,path2);route(inf,path2);
      if(inf.conductors!==undefined) {
        list(inf.conductors,`${path2}.conductors`,100);const seen=new Set<number>();
        inf.conductors.forEach((conductor,i)=>{const p=`${path2}.conductors[${i}]`;object(conductor,p);keys(conductor,['p','color'],p);numeric(conductor.p,`${p}.p`,0,polesOf(component as unknown as Component).length-1,true);color(conductor.color,`${p}.color`);if(seen.has(conductor.p))fail(p,'ismétlődő betáplálási pólus.');seen.add(conductor.p);});
      }
      if(inf.entry!==undefined) {
        object(inf.entry,`${path2}.entry`);keys(inf.entry,['row','x','dx','top'],`${path2}.entry`);numeric(inf.entry.x,`${path2}.entry.x`,-100_000,100_000);
        if(inf.entry.row!==undefined)numeric(inf.entry.row,`${path2}.entry.row`,0,rows.length-1,true);
        if(inf.entry.dx!==undefined)numeric(inf.entry.dx,`${path2}.entry.dx`,-1_000_000,1_000_000);boolean(inf.entry.top,`${path2}.entry.top`);
      }
    }
    if(component.circuits!==undefined) {
      list(component.circuits,`${path}.circuits`);const circuitNumbers=new Set<string>();
      component.circuits.forEach((entry,i)=>{
        const path2=`${path}.circuits[${i}]`;object(entry,path2);keys(entry,['no','name','rating','power','devices','phase','loadType','consumers',...cableKeys],path2);
        if(typeof entry.no==='number')numeric(entry.no,`${path2}.no`,0,1_000_000,true);else {string(entry.no,`${path2}.no`,200);if(!entry.no.trim())fail(`${path2}.no`,'hibás azonosító.');}
        if(circuitNumbers.has(String(entry.no)))fail(path2,'ismétlődő áramkörszám.');circuitNumbers.add(String(entry.no));
        if(entry.rating!==undefined)numericText(entry.rating,`${path2}.rating`,0,1_000_000);
        textFields(entry,['name','loadType','consumers'],path2);numericText(entry.power,`${path2}.power`);phase(entry.phase,`${path2}.phase`);cable(entry,path2);
        // These are source consumer descriptions, not references to our shared device IDs.
        if(entry.devices!==undefined)list(entry.devices,`${path2}.devices`);
      });
    }
  });
  const components=new Map((value.comps as unknown as Component[]).map(c=>[c.id,c]));
  list(value.wires,'wires');const wireIds=unique(value.wires,'wires');
  value.wires.forEach((wire,index)=>{
    const path=`wires[${index}]`;object(wire,path);keys(wire,['id','a','b','color','colors',...cableKeys,...routeKeys],path);
    endpoint(wire.a,`${path}.a`,components);endpoint(wire.b,`${path}.b`,components);color(wire.color,`${path}.color`);
    if(wire.colors!==undefined) {list(wire.colors,`${path}.colors`,3);if(wire.colors.length!==3)fail(`${path}.colors`,'három érszín szükséges.');wire.colors.forEach((c,i)=>color(c,`${path}.colors[${i}]`));}
    cable(wire,path);route(wire,path);
  });
  if(value.bw!==undefined) {
    list(value.bw,'bw');unique(value.bw,'bw',wireIds);
    value.bw.forEach((tap,index)=>{
      const path=`bw[${index}]`;object(tap,path);keys(tap,['id','c','p','color','feed',...cableKeys,...routeKeys],path);
      endpoint({c:tap.c,s:'bottom',...(tap.p!==undefined?{p:tap.p}:{})},path,components);
      const c=components.get(tap.c as string)!;const row=rows[c.row] as Raw;if(!row.bar)fail(path,'hiányzó fázissín.');
      color(tap.color,`${path}.color`);boolean(tap.feed,`${path}.feed`);cable(tap,path);route(tap,path);
    });
  }
  if(value.bb!==undefined) {
    list(value.bb,'bb');unique(value.bb,'bb',wireIds);
    value.bb.forEach((wire,index)=>{
      const path=`bb[${index}]`;object(wire,path);keys(wire,['id','c','s','p','bus','box','row','k','color','ext',...cableKeys,...routeKeys],path);
      if(wire.c!==undefined)endpoint({c:wire.c,s:wire.s,...(wire.p!==undefined?{p:wire.p}:{})},path,components);
      if(wire.bus==='row') {
        numeric(wire.row,`${path}.row`,0,rows.length-1,true);const row=rows[wire.row] as Raw;
        if(!row.bar)fail(path,'hiányzó fázissín.');if(wire.c===undefined)fail(path,'hiányzó készülék.');
        if(wire.k!==undefined)numeric(wire.k,`${path}.k`,0,(row.mods as number)-1,true);
      } else if(wire.bus==='n'||wire.bus==='pe') {
        numeric(wire.box,`${path}.box`,0,boxes.length-1,true);const capacity=((boxes[wire.box] as Raw).bus as Raw|undefined)?.[wire.bus];
        if(typeof capacity!=='number'||capacity<=0)fail(path,'hiányzó sín.');numeric(wire.k,`${path}.k`,0,capacity-1,true);
        if(wire.c===undefined&&wire.ext===undefined)fail(path,'hiányzó készülék vagy külső betáplálás.');
      } else fail(`${path}.bus`,'ismeretlen sín.');
      if(wire.c!==undefined&&wire.ext!==undefined)fail(path,'a készülék és a külső betáplálás egyaránt meg van adva.');
      if(wire.ext!==undefined) {
        object(wire.ext,`${path}.ext`);keys(wire.ext,['x','row','label','title','dy','edge'],`${path}.ext`);
        numeric(wire.ext.x,`${path}.ext.x`,-100_000,100_000);numeric(wire.ext.row,`${path}.ext.row`,0,rows.length-1,true);
        textFields(wire.ext,['label','title'],`${path}.ext`);if(wire.ext.dy!==undefined)numeric(wire.ext.dy,`${path}.ext.dy`,-1_000_000,1_000_000);
        if(wire.ext.edge!==undefined&&!['','right','left'].includes(wire.ext.edge as string))fail(`${path}.ext.edge`,'ismeretlen útvonal.');
      }
      color(wire.color,`${path}.color`);cable(wire,path);route(wire,path);
    });
  }
  if(value.lo!==undefined) {
    object(value.lo,'lo');if(Object.keys(value.lo).length>20_000)fail('lo','hibás vagy túl hosszú lista.');
    for(const [key,offset]of Object.entries(value.lo)) {identifier(key,`lo.${key}`);object(offset,`lo.${key}`);keys(offset,['dx','dy'],`lo.${key}`);numeric(offset.dx,`lo.${key}.dx`,-1_000_000,1_000_000);numeric(offset.dy,`lo.${key}.dy`,-1_000_000,1_000_000);}
  }
}

function widthOf(component:Component) {return specialWidths[component.type]?.[component.poles]??widths[component.poles];}
function numberOf(value:number|string|undefined):number|undefined {
  return value===undefined||value===''?undefined:Number(String(value).replace(',','.'));
}
function cableDetails(value:SourceCable):CableDetails|undefined {
  const result:CableDetails={};
  if(value.cable!==undefined)result.designation=value.cable;
  else if(value.ctype!==undefined)result.designation=value.ctype;
  const cores=numberOf(value.cores),cs=numberOf(value.cs),length=numberOf(value.length);
  if(cores!==undefined)result.cores=cores;if(cs!==undefined)result.crossSectionMm2=cs;if(length!==undefined)result.lengthM=length;
  if(value.mat==='Cu')result.material='Cu';else if(value.mat==='Al'||value.mat==='Alu')result.material='Al';
  return Object.keys(result).length?result:undefined;
}
function clone<T>(value:T):T {return structuredClone(value);}
/** Ensure the complete snapshot is finite, bounded inert JSON, including consumer metadata. */
function snapshot(value:unknown):Raw {
  const seen=new Set<object>();let nodes=0;
  function check(item:unknown,path:string,depth:number) {
    if(++nodes>100_000||depth>30)fail(path,'a forrásadat túl nagy vagy túl mély.');
    if(item===null||typeof item==='string'||typeof item==='boolean')return;
    if(typeof item==='number') {if(!Number.isFinite(item))fail(path,'hibás vagy határon kívüli szám.');return;}
    if(!item||typeof item!=='object'||seen.has(item))fail(path,'kizárólag véges JSON-adatok importálhatók.');
    if(!Array.isArray(item)&&Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null)fail(path,'kizárólag véges JSON-adatok importálhatók.');
    seen.add(item);Object.entries(item).forEach(([key,child])=>check(child,`${path}.${key}`,depth+1));seen.delete(item);
  }
  check(value,'JSON',0);const raw=JSON.stringify(value);if(raw.length>15_000_000)fail('JSON','a forrásadat túl nagy vagy túl mély.');
  return JSON.parse(raw) as Raw;
}
function deviceEndpoint(source:Endpoint,mapped:Map<string,string>):WiringEndpoint {
  return {kind:'device',deviceId:mapped.get(source.c)!,side:source.s,...(source.p!==undefined?{pole:source.p}:{})};
}

/** Import the source as data only: never evaluate its HTML or run project-specific migrations. */
export function importLegacyBoardV3(value:unknown):ProjectDocument {
  const raw=snapshot(value);validate(raw);const source=raw as unknown as Source;
  const doc=createProject(source.project.name);const boxes=source.boxes??[{name:source.project.name,bus:source.bus,bu:source.bu}];
  const boards:Board[]=boxes.map(box=>({id:uid(),name:box.name||t('Importált elosztó'),rows:[],connections:[],wiring:{buses:[],wires:[],infeeds:[],...(source.project.demand!==undefined?{demandFactor:source.project.demand}:{})}}));
  doc.data.boards=boards;boards[0].wiring!.source=clone(raw);
  const rowIds=source.rows.map((row,index)=>{
    const board=boards[row.box??0],id=uid();board.rows.push({id,name:t('{number}. sor',{number:index+1}),capacity:row.mods,placements:[]});return id;
  });
  if(source.lo)boards[0].wiring!.labelOffsets=Object.fromEntries(Object.entries(source.lo).map(([key,offset])=>[key,{x:offset.dx,y:offset.dy}]));
  const mapped=new Map(source.comps.map(c=>[c.id,uid()]));const byId=new Map(source.comps.map(c=>[c.id,c]));
  const mappedEndpoint=(value:Endpoint)=>deviceEndpoint({...value,...(value.p===undefined&&polesOf(byId.get(value.c)!).length===1?{p:0}:{})},mapped);
  const codes=new Map<string,string>(),used=new Set<string>(),counters=new Map<string,number>();
  const sorted=[...source.comps].sort((a,b)=>a.row-b.row||a.x-b.x);
  for(const component of sorted) {
    const preferred=component.tag||(component.kmsz!==undefined&&component.kmsz!==''&&['mcb','rcbo'].includes(component.type)?`${definitions[component.type].prefix}${component.kmsz}`:undefined);
    if(preferred) {codes.set(component.id,preferred);used.add(preferred);}
  }
  for(const component of sorted) {
    if(codes.has(component.id))continue;const prefix=definitions[component.type].prefix;let code:string;
    do {const count=(counters.get(prefix)??0)+1;counters.set(prefix,count);code=`${prefix}${count}`;}while(used.has(code));
    codes.set(component.id,code);used.add(code);
  }
  for(const component of source.comps) {
    const definition=definitions[component.type],device=makeDevice(definition.kind,doc.data.devices),board=boards[source.rows[component.row].box??0];
    device.id=mapped.get(component.id)!;device.code=codes.get(component.id)!;device.name=component.name??t(definition.label);device.boardId=board.id;device.moduleWidth=widthOf(component);
    device.rating=[component.poles,component.rating!==undefined?`${component.curve??''}${component.rating} A`:'',component.sens!==undefined?`${component.sens} mA`:'',component.rtype,component.cls].filter(Boolean).join(' · ');
    device.electrical={poles:polesOf(component),role:component.type,originalId:component.id,
      ...(component.type==='terminal'&&component.poles==='1P'?{commonPoleGroups:[[0,1]]}:{}),
      ...(component.phase?{phase:component.phase}:{}),...(component.rating!==undefined?{currentA:component.rating}:{}),
      ...(component.curve!==undefined?{curve:component.curve}:{}),...(component.sens!==undefined?{residualCurrentMa:component.sens}:{}),
      ...(component.rtype!==undefined?{residualType:component.rtype}:{}),...(component.cls!==undefined?{spdClass:component.cls}:{}),
      ...(component.group!==undefined?{group:component.group}:{}),...(component.nos!==undefined?{circuitNumbers:component.nos}:{}),...(component.consumers!==undefined?{consumers:component.consumers}:{}),
    };
    device.notes=[t('Elosztó JSON v3 import. Eredeti típus: {type}; pólusszám: {poles}; azonosító: {id}.',{type:component.type,poles:component.poles,id:component.id}),
      t('Az importált {width} M modulszélesség a régi általános rajzjeleket követi; gyártói adattal nem ellenőrzött.',{width:device.moduleWidth}),
      component.cable!==undefined?t('Importált kábel: {value}',{value:component.cable}):'',
      component.loadType!==undefined?t('Eredeti fogyasztójel: {value}',{value:component.loadType}):'',
    ].filter(Boolean).join('\n');
    const circuitSources=component.circuits!==undefined?component.circuits:loadRoles.has(component.type)?[component]:[];
    for(const circuitSource of circuitSources) {
      const detailed='no' in circuitSource;const id=uid();if(!device.circuitId)device.circuitId=id;
      const power=numberOf(circuitSource.power),details=cableDetails(circuitSource);
      const circuit:Circuit={id,code:detailed?String(circuitSource.no):device.code,name:detailed?(circuitSource.name??`${device.name} · ${circuitSource.no}`):device.name,color:circuitColors[doc.data.circuits.length%circuitColors.length],
        notes:[circuitSource.consumers??'',detailed&&circuitSource.devices!==undefined?JSON.stringify(circuitSource.devices):'',circuitSource.loadType!==undefined?t('Eredeti fogyasztójel: {value}',{value:circuitSource.loadType}):''].filter(Boolean).join('\n'),
        ...(['mcb','rcbo','mpcb'].includes(component.type)?{protectionDeviceId:device.id}:{}),
        ...(circuitSource.cable!==undefined?{cable:circuitSource.cable}:{}),...(power!==undefined?{powerW:power}:{}),...(details?{cableDetails:details}:{}),
        ...(circuitSource.phase?{phase:circuitSource.phase}:{}),
        ...(['socket','lamp','motor','other'].includes(circuitSource.loadType??'')?{loadType:circuitSource.loadType as Circuit['loadType']}:{}),
      };
      doc.data.circuits.push(circuit);
    }
    doc.data.devices.push(device);board.rows.find(row=>row.id===rowIds[component.row])!.placements.push({deviceId:device.id,start:component.x});
  }
  const busIds=new Map<string,string>();
  const tapPosition=(tap:SourceTap)=>{const c=byId.get(tap.c)!;return c.x+(tap.p??Math.floor((widthOf(c)-1)/2));};
  const rowBarStart=(index:number)=>{
    const row=source.rows[index],positions=(source.bw??[]).filter(tap=>byId.get(tap.c)!.row===index).map(tapPosition);
    const low=positions.length?Math.min(...positions):0,high=positions.length?Math.max(...positions):0;
    const length=Math.min(row.mods,Math.max(row.barN??0,positions.length?high-low+1:6));
    return Math.max(0,Math.min(low,row.mods-length));
  };
  boxes.forEach((box,index)=>{
    for(const key of ['n','pe'] as const) {
      const capacity=box.bus?.[key]??0;if(!capacity)continue;const id=uid();busIds.set(`${index}:${key}`,id);
      boards[index].wiring!.buses.push({id,name:t(key==='n'?'N sín':'PE sín'),conductor:key==='n'?'N':'PE',capacity,position:box.busPos??'top',terminalLabels:Array.from({length:capacity},(_,i)=>box.bu?.[key]?.[i]??'')});
    }
  });
  source.rows.forEach((row,index)=>{
    if(!row.bar)return;const id=uid();busIds.set(`row:${index}`,id);
    boards[row.box??0].wiring!.buses.push({id,name:t('{phase} fázissín',{phase:row.bar}),conductor:row.bar,capacity:row.mods,rowId:rowIds[index],position:'bottom',terminalLabels:Array.from({length:row.mods},()=> '')});
  });
  const labelOffset=(key:string)=>{const offset=source.lo?.[key];return offset?{x:offset.dx,y:offset.dy}:undefined;};
  const append=(board:Board,from:WiringEndpoint,to:WiringEndpoint,item:SourceCable,metadata:Raw,colorValue?:string,offsetKey?:string)=>{
    const details=cableDetails(item),offset=offsetKey?labelOffset(offsetKey):undefined;
    const wire:BoardWire={id:uid(),from,to,sourceRoute:clone(metadata),...(colorValue?{color:colorValue==='gy'?'#26833b':colorValue}:{}),...(details?{cable:details}:{}),...(offset?{labelOffset:offset}:{})};
    board.wiring!.wires.push(wire);return wire;
  };
  for(const wire of source.wires) {
    const a=byId.get(wire.a.c)!,b=byId.get(wire.b.c)!,board=boards[source.rows[a.row].box??0];
    const bundle=wire.a.p===undefined&&wire.b.p===undefined&&polesOf(a).some(p=>p==='L3')&&polesOf(b).some(p=>p==='L3');
    for(const p of bundle?[0,1,2]:[undefined]) {
      const from=mappedEndpoint({...wire.a,...(p!==undefined?{p}:{})}),to=mappedEndpoint({...wire.b,...(p!==undefined?{p}:{})});
      const selected=p??wire.a.p,conductor=selected!==undefined?polesOf(a)[selected]:wire.b.p!==undefined?polesOf(b)[wire.b.p]:polesOf(a).length===1?polesOf(a)[0]:undefined;
      append(board,from,to,wire,wire as unknown as Raw,bundle?wire.colors?.[p!]??wireColors[polesOf(a)[p!]]:wire.color??(conductor?wireColors[conductor]:undefined));
    }
  }
  for(const tap of source.bw??[]) {
    const component=byId.get(tap.c)!,row=source.rows[component.row],board=boards[row.box??0];
    const terminal=tapPosition(tap);
    // A tap outside the physical row is recoverable geometry; preserve its source
    // coordinate and attach an extra labelled terminal instead of rounding it.
    const bus=board.wiring!.buses.find(item=>item.id===busIds.get(`row:${component.row}`))!;
    let slot=terminal;
    if(!Number.isInteger(slot)||slot<0||slot>=bus.capacity) {slot=bus.capacity++;bus.terminalLabels.push(String(terminal));}
    append(board,mappedEndpoint({c:tap.c,s:'bottom',...(tap.p!==undefined?{p:tap.p}:{})}),{kind:'bus',busId:bus.id,terminal:slot},tap,{...clone(tap),tapPosition:terminal},tap.color??wireColors[row.bar as Phase]);
  }
  for(const wire of source.bb??[]) {
    const row=wire.bus==='row'?source.rows[wire.row!]:undefined,box=row?.box??wire.box??0,board=boards[box];
    const busId=busIds.get(wire.bus==='row'?`row:${wire.row}`:`${box}:${wire.bus}`)!;const bus=board.wiring!.buses.find(item=>item.id===busId)!;
    const terminal=wire.k??(wire.bus==='row'?rowBarStart(wire.row!):0);
    let slot=terminal;
    if(!Number.isInteger(slot)||slot<0||slot>=bus.capacity) {slot=bus.capacity++;bus.terminalLabels.push(String(terminal));}
    const to:WiringEndpoint={kind:'bus',busId,terminal:slot};let from:WiringEndpoint;
    if(wire.c)from=mappedEndpoint({c:wire.c,s:wire.s!,...(wire.p!==undefined?{p:wire.p}:{})});
    else {
      const ext=wire.ext!,id=uid(),infeed:BoardInfeed={id,name:ext.title||ext.label||t('Külső betáplálás'),kind:'supply',poles:[bus.conductor],...(cableDetails(wire)?{cable:cableDetails(wire)}:{}),...(labelOffset(`ext:${wire.id}`)?{labelOffset:labelOffset(`ext:${wire.id}`)}:{})};
      board.wiring!.infeeds.push(infeed);from={kind:'infeed',infeedId:id,pole:0};
    }
    append(board,from,to,wire,wire as unknown as Raw,wire.color??wireColors[bus.conductor],`ext:${wire.id}`);
  }
  for(const component of source.comps) {
    const inf=component.infeed;if(!inf)continue;const board=boards[source.rows[component.row].box??0],poles=polesOf(component);
    // Match source rendering defaults without inventing an absent neutral/PE core.
    const conductors=inf.conductors?.length?inf.conductors:poles.includes('L3')?[{p:0},{p:1},{p:2}]:[{p:0}];
    const id=uid(),details=cableDetails(inf),offset=labelOffset(`in:${component.id}`);
    const infeed:BoardInfeed={id,name:inf.name??t(inf.kind==='earth'?'Földelő szonda':'Betáplálás'),kind:inf.kind==='earth'?'earth':'supply',poles:conductors.map(c=>inf.kind==='earth'?'PE':poles[c.p]),...(details?{cable:details}:{}),...(offset?{labelOffset:offset}:{})};
    board.wiring!.infeeds.push(infeed);
    conductors.forEach((conductor,index)=>append(board,{kind:'infeed',infeedId:id,pole:index},mappedEndpoint({c:component.id,s:inf.side??'top',p:conductor.p}),inf,{...clone(inf),componentId:component.id},conductor.color??wireColors[inf.kind==='earth'?'PE':poles[conductor.p]],`in:${component.id}`));
  }
  doc.data.notes=[t('Elosztó JSON v3 import. A készülékek, sorpozíciók, pólusok, sínek és vezetékek megmaradtak; a forrásadatok az első elosztóban archiválva vannak. Automatikus bekötésmódosítás nem történt.'),
    source.project.author!==undefined?t('Eredeti terv szerzője: {author}',{author:source.project.author}):'',source.project.date!==undefined?t('Eredeti terv dátuma: {date}',{date:source.project.date}):'',
  ].filter(Boolean).join('\n');
  validateProject(doc);
  return checkpoint(doc,t('Elosztó JSON v3 importálása'));
}
