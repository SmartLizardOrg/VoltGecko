import type { CSSProperties } from 'react';
import type { DeviceKind, DeviceVariant } from '../types';

/** Original schematic artwork inside the shared 38 × 38 view box. */
export function SymbolGlyph({ kind, variant, color = 'currentColor' }: { kind: DeviceKind; variant?: DeviceVariant; color?: string }) {
  const common = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const label = (text: string, y = 4, size = 10, x = 0) => <text x={x} y={y} fill={color} stroke="none" fontFamily="sans-serif" fontSize={size} fontWeight="600" textAnchor="middle">{text}</text>;
  if (kind === 'outlet') {
    if (variant === 'outlet-double') return <g {...common}><path d="M-14 9A7 7 0 0 1 0 9M0 9A7 7 0 0 1 14 9M-7 2V-13M7 2V-13M-14 2H14" /></g>;
    if (variant === 'outlet-three-phase') return <g {...common}><path d="M-13 9A9 9 0 0 1 5 9M-4 0V-14M-13 0H5M4 5L10-4H15" />{label('3~', -8, 7, 11)}</g>;
    return <g {...common}><path d="M-12 10A12 12 0 0 1 12 10M0-2V-15M-12-2H12" />{variant === 'outlet-weatherproof' && label('IP', 12, 7)}</g>;
  }
  if (kind === 'switch') {
    if (variant === 'switch-push-button' || variant === 'switch-push-button-lit') return <g {...common}><circle r="11" /><circle r="8" />{variant === 'switch-push-button-lit' && <path d="M-5-5L5 5M5-5L-5 5" />}</g>;
    if (variant === 'switch-two-way') return <g {...common}><circle r="4" /><path d="M3-3L12-14L16-11M-3 3L-12 14L-16 11" /></g>;
    if (variant === 'switch-intermediate') return <g {...common}><circle r="4" /><path d="M3-3L12-14L16-11M-3 3L-12 14L-16 11M-3-3L-12-14L-16-11M3 3L12 14L16 11" /></g>;
    if (variant === 'switch-double-two-way') return <g {...common}><circle cx="-7" r="3" /><circle cx="7" r="3" /><path d="M-5-2L1-12L4-10M-9 2L-15 12L-18 10M9-2L15-12L18-10M5 2L-1 12L-4 10" /></g>;
    return <g {...common}><circle cy="6" r="4" /><path d="M3 3L11-11L15-9" />{variant === 'switch-double-pole' && <path d="M8-6L12-4" />}{variant === 'switch-series' && <path d="M-3 3L-11-11L-15-9" />}{variant === 'switch-dimmer' && <path d="M13 15L-14-12M-14-12L-12-5M-14-12L-7-10" />}</g>;
  }
  if (kind === 'light') {
    if (variant === 'light-wall') return <g {...common}><path d="M-5-9L13 9M13-9L-5 9M-15 0H4" /></g>;
    if (variant === 'light-linear') return <g {...common}><path d="M-14 0H14M-14-5V5M14-5V5" /></g>;
    if (variant === 'light-led-strip') return <g {...common}><rect x="-15" y="-6" width="30" height="8" rx="1" /><path d="M-10-2H-8M-4-2H-2M2-2H4M8-2H10" />{label('LED', 13, 8)}</g>;
    return <g {...common}><path d="M-10-10L10 10M10-10L-10 10" /></g>;
  }
  if (kind === 'junction') return <g {...common}><circle cy="-3" r="8" /><path d="M-15-3H15M0-3V14" /></g>;
  if (kind === 'sensor') return variant === 'sensor-motion' || variant === 'sensor-thermostat' ? <g {...common}><rect x="-14" y="-10" width="28" height="20" rx="1" />{label(variant === 'sensor-motion' ? 'PIR' : 'T')}</g> : <g {...common}><path d="M0-13L13 0L0 13L-13 0Z" /><circle r="3" /><path d="M-6-6A8.5 8.5 0 0 1 6-6M-8.5-8.5A12 12 0 0 1 8.5-8.5" /></g>;
  if (kind === 'relay') return <g {...common}><rect x="-12" y="-10" width="24" height="20" rx="2" /><path d="M-7 4V-4H-1V4M2 4L7-4M2-4H4M5 4H7M-16 0H-12M12 0H16" /></g>;
  if (kind === 'hub') return <g {...common}><rect x="-11" y="-11" width="22" height="22" rx="3" /><circle r="3" /><path d="M0-11V-15M0 11V15M-11 0H-15M11 0H15M-2-3L-6-7M2 3L6 7M2-3L6-7M-2 3L-6 7" /></g>;
  if (kind === 'blank') return <g {...common}><rect x="-10" y="-13" width="20" height="26" rx="2" /><path opacity=".4" d="M-5-8L5 2M-5-1L5 9" /></g>;
  if (kind === 'spd') return <g {...common}><rect x="-11" y="-13" width="22" height="26" rx="2" /><path d="M2-9L-5 1H1L-2 9L6-2H0Z" /></g>;
  if (kind === 'custom') {
    if (variant === 'custom-tv' || variant === 'custom-phone' || variant === 'custom-data') return <g {...common}><path d="M-13 10V-1H-1V10M-7-1V-14" />{label(variant === 'custom-tv' ? 'TV' : variant === 'custom-phone' ? 'TP' : 'DATA', 9, variant === 'custom-data' ? 6 : 8, 9)}</g>;
    if (variant === 'custom-bell') return <g {...common}><path d="M-11 7L-8 3V-3A8 8 0 0 1 8-3V3L11 7ZM-3 11A3 3 0 0 0 3 11M0-11V-14" /></g>;
    return <g {...common}><rect x="-11" y="-13" width="22" height="26" rx="2" /><path d="M-5-5L5 5M5-5L-5 5" /></g>;
  }
  return <g {...common}><rect x="-10" y="-13" width="20" height="26" rx="2" /><path d="M0-13V-7M0 7V13M0 6L5-4M-3-6H3M-3 6H3" />{(kind === 'rcd' || kind === 'rcbo') && <path d="M-7-3V3M-8 0H-6" />}{kind === 'main' && <circle cx="0" cy="-5" r="1.5" />}</g>;
}

export function DeviceSymbol({ kind, variant, size = 32, color = 'currentColor', className, style }: { kind: DeviceKind; variant?: DeviceVariant; size?: number; color?: string; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="-19 -19 38 38" aria-hidden="true" className={className} style={style}><SymbolGlyph kind={kind} variant={variant} color={color} /></svg>;
}

export default DeviceSymbol;
