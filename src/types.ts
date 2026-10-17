import type { ProductSnapshot } from './products/types';
export type DeviceKind = 'outlet' | 'switch' | 'light' | 'junction' | 'sensor' | 'relay' | 'hub' | 'breaker' | 'rcd' | 'rcbo' | 'spd' | 'main' | 'blank' | 'custom';
export type DeviceStatus = 'planned' | 'installed' | 'verified';
export interface Point { x: number; y: number }
export interface Device {
  id: string; code: string; name: string; kind: DeviceKind; room: string;
  heightMm: number; model: string; notes: string; status: DeviceStatus;
  circuitId?: string; moduleWidth?: number; rating?: string; photoIds: string[];
  product?: ProductSnapshot; boardId?:string; quantity?:number;
}
export interface Placement extends Point { deviceId: string; rotation: number }
export interface Route { id: string; fromDeviceId: string; toDeviceId: string; kind: 'power' | 'control'; circuitId?: string; points: Point[] }
export interface Annotation extends Point { id: string; text: string }
export interface PlanSheet { id: string; name: string; width: number; height: number; backgroundAssetId?: string; mmPerUnit?: number; placements: Placement[]; routes: Route[]; annotations: Annotation[] }
export interface Circuit { id: string; code: string; name: string; color: string; protectionDeviceId?: string; notes: string; cable?:string; powerW?:number; loadType?:'socket'|'lamp'|'motor'|'other' }
export interface BoardPlacement { deviceId: string; start: number }
export interface BoardRow { id: string; name: string; capacity: number; placements: BoardPlacement[] }
/** Device-level supply links, independent of floor-plan routes; no individual terminals. */
export interface BoardConnection { id:string; fromDeviceId?:string; toDeviceId:string }
export interface Board { id: string; name: string; rows: BoardRow[]; product?:ProductSnapshot; connections?:BoardConnection[]; supplyLabel?:string }
export interface Asset { id: string; name: string; mime: string; data: string }
export interface ProjectData { id: string; name: string; site: string; client: string; notes: string; sheets: PlanSheet[]; devices: Device[]; circuits: Circuit[]; boards: Board[] }
export interface Revision { id: string; parentId?: string; createdAt: string; note: string; data: ProjectData; restoredFrom?: string }
export interface ProjectDocument { schemaVersion: 1; data: ProjectData; assets: Record<string, Asset>; revisions: Revision[]; headRevisionId?: string; updatedAt: string; lastExternalSaveAt?: string; lastDriveSaveAt?: string }
export interface ProjectSummary { id: string; name: string; site: string; updatedAt: string }
export interface CatalogEntry { kind: DeviceKind; label: string; short: string; category: 'floor' | 'board'; moduleWidth?: number; description: string }
