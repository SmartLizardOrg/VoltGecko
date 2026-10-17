import { t } from './i18n';
import type { CatalogEntry, Device, DeviceKind } from './types';
const CATALOG_DEFINITIONS: CatalogEntry[] = [
  {kind:'outlet',label:'Dugalj',short:'D',category:'floor',description:'Védőérintkezős dugalj'},
  {kind:'switch',label:'Kapcsoló',short:'K',category:'floor',description:'Világításkapcsoló'},
  {kind:'light',label:'Lámpa',short:'L',category:'floor',description:'Világítási kiállás'},
  {kind:'junction',label:'Kötődoboz',short:'KD',category:'floor',description:'Hozzáférhető kötési pont'},
  {kind:'sensor',label:'Érzékelő',short:'É',category:'floor',description:'Egyedi okosotthon-jel'},
  {kind:'relay',label:'Relémodul',short:'R',category:'floor',description:'Egyedi vezérlőmodul'},
  {kind:'hub',label:'Központ',short:'H',category:'floor',description:'Egyedi okosotthon-központ'},
  {kind:'breaker',label:'Kismegszakító',short:'QF',category:'board',moduleWidth:1,description:'Kézzel megadott névleges adatok'},
  {kind:'rcd',label:'FI-relé',short:'FI',category:'board',moduleWidth:2,description:'Áram-védőkapcsoló'},
  {kind:'rcbo',label:'Kombinált védelem',short:'RC',category:'board',moduleWidth:2,description:'Túláram- és hibaáramvédelem'},
  {kind:'spd',label:'Túlfeszültség-védelem',short:'SPD',category:'board',moduleWidth:4,description:'Egyedi gyártói modulszélesség'},
  {kind:'main',label:'Főkapcsoló',short:'Q',category:'board',moduleWidth:2,description:'Elosztó főkapcsolója'},
  {kind:'blank',label:'Tartalékhely',short:'T',category:'board',moduleWidth:1,description:'Tervezett tartalékhely'},
  {kind:'custom',label:'Egyedi készülék',short:'X',category:'board',moduleWidth:1,description:'Megadható típus és modulszélesség'},
];
export const CATALOG: CatalogEntry[] = CATALOG_DEFINITIONS.map(entry => ({
  ...entry,
  get label() { return t(entry.label); },
  get description() { return t(entry.description); },
}));
export const kindLabel = (kind: DeviceKind) => CATALOG.find(c => c.kind === kind)?.label ?? kind;
export const uid = ():string => {
  if(crypto.randomUUID)return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
export function makeDevice(kind: DeviceKind, devices: Device[]): Device {
  const e = CATALOG.find(c => c.kind === kind)!;
  let n = 1; while (devices.some(d => d.code === `${e.short}${n}`)) n++;
  return { id:uid(),code:`${e.short}${n}`,name:e.label,kind,room:'',heightMm:kind==='outlet'?300:kind==='switch'?1100:0,model:'',notes:'',status:'planned',moduleWidth:e.moduleWidth,photoIds:[],rating:kind==='breaker'?'B16':kind==='rcd'?'40 A / 30 mA':'' };
}
