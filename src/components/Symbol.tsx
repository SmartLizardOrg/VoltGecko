import type { CSSProperties } from 'react';
import type { DeviceKind } from '../types';

/** Original schematic artwork. Coordinates are centered on a 32 × 32 symbol. */
export function SymbolGlyph({ kind, color = 'currentColor' }: { kind: DeviceKind; color?: string }) {
  const common = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'outlet') return <g {...common}><circle r="11" /><path d="M-4-8V1M4-8V1M-11 4H11M0 4V11" /></g>;
  if (kind === 'switch') return <g {...common}><circle r="5" /><path d="M3.5-3.5L12-12M9-12H12V-9" /></g>;
  if (kind === 'light') return <g {...common}><circle r="11" /><path d="M-7.8-7.8L7.8 7.8M7.8-7.8L-7.8 7.8" /></g>;
  if (kind === 'junction') return <g {...common}><rect x="-10" y="-10" width="20" height="20" rx="1" /><circle r="2" fill={color} /><path d="M-15 0H-10M10 0H15M0-15V-10M0 10V15" /></g>;
  if (kind === 'sensor') return <g {...common}><path d="M0-13L13 0L0 13L-13 0Z" /><circle r="3" /><path d="M-6-6A8.5 8.5 0 0 1 6-6M-8.5-8.5A12 12 0 0 1 8.5-8.5" /></g>;
  if (kind === 'relay') return <g {...common}><rect x="-12" y="-10" width="24" height="20" rx="2" /><path d="M-7 4V-4H-1V4M2 4L7-4M2-4H4M5 4H7M-16 0H-12M12 0H16" /></g>;
  if (kind === 'hub') return <g {...common}><rect x="-11" y="-11" width="22" height="22" rx="3" /><circle r="3" /><path d="M0-11V-15M0 11V15M-11 0H-15M11 0H15M-2-3L-6-7M2 3L6 7M2-3L6-7M-2 3L-6 7" /></g>;
  if (kind === 'blank') return <g {...common}><rect x="-10" y="-13" width="20" height="26" rx="2" /><path opacity=".4" d="M-5-8L5 2M-5-1L5 9" /></g>;
  if (kind === 'spd') return <g {...common}><rect x="-11" y="-13" width="22" height="26" rx="2" /><path d="M2-9L-5 1H1L-2 9L6-2H0Z" /></g>;
  if (kind === 'custom') return <g {...common}><rect x="-11" y="-13" width="22" height="26" rx="2" /><path d="M-5-5L5 5M5-5L-5 5" /></g>;
  return <g {...common}><rect x="-10" y="-13" width="20" height="26" rx="2" /><path d="M0-13V-7M0 7V13M0 6L5-4M-3-6H3M-3 6H3" />{(kind === 'rcd' || kind === 'rcbo') && <path d="M-7-3V3M-8 0H-6" />}{kind === 'main' && <circle cx="0" cy="-5" r="1.5" />}</g>;
}

export function DeviceSymbol({ kind, size = 32, color = 'currentColor', className, style }: { kind: DeviceKind; size?: number; color?: string; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="-19 -19 38 38" aria-hidden="true" className={className} style={style}><SymbolGlyph kind={kind} color={color} /></svg>;
}

export default DeviceSymbol;
