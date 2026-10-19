import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { t } from '../i18n';
import { getPlanAppearance } from '../data/planAppearance';
import type { Asset, Device, FloorPlanDisplay } from '../types';
import { SymbolGlyph } from './Symbol';

interface Props {
  device: Device;
  assets: Record<string, Asset>;
  display: FloorPlanDisplay;
  rotation: number;
  color: string;
  highlighted: boolean;
}

export function PlanDeviceGraphic({ device, assets, display, rotation, color, highlighted }: Props) {
  const appearance = getPlanAppearance(device, assets, display);
  const [failedSource, setFailedSource] = useState<string>();
  const [loadedSource, setLoadedSource] = useState<string>();
  const source = appearance.kind === 'image' ? appearance.asset.data : undefined;
  useEffect(() => {
    if (!source) return;
    let active = true;
    // SVG image error events differ between browsers. Decode with an HTML image
    // before painting it, so malformed imported pictures get a reliable fallback.
    const image = new Image();
    image.onload = () => { if (active) setLoadedSource(source); };
    image.onerror = () => { if (active) setFailedSource(source); };
    image.src = source;
    return () => { active = false; image.onload = null; image.onerror = null; };
  }, [source]);
  if (appearance.kind === 'symbol') return <>
    {highlighted && <circle r="25" fill={color} opacity=".12" />}
    <circle r="19" fill="white" fillOpacity=".94" stroke={highlighted ? color : '#e2e8e4'} strokeWidth={highlighted ? 1.5 : 0.8} />
    <g transform={`rotate(${rotation})`} data-testid="floor-device-symbol"><SymbolGlyph kind={device.kind} color={color} /></g>
  </>;

  const half = appearance.size / 2;
  const image = appearance.kind === 'image' && loadedSource === appearance.asset.data && failedSource !== appearance.asset.data ? appearance : undefined;
  return <>
    <g transform={`rotate(${rotation})`}>
      <rect className={`floor-image-frame ${highlighted ? 'is-highlighted' : ''}`} x={-half - 3} y={-half - 3} width={appearance.size + 6} height={appearance.size + 6} rx="4" fill="transparent" stroke={highlighted ? color : 'none'} strokeWidth="1.5" />
      {image ? <image
        className="floor-device-image"
        data-testid="floor-device-image"
        x={-half} y={-half} width={appearance.size} height={appearance.size}
        href={image.asset.data} preserveAspectRatio="xMidYMid meet" opacity={image.opacity}
        pointerEvents="none" aria-hidden="true"
        onError={() => setFailedSource(image.asset.data)}
      /> : <rect className="floor-missing-image-frame" data-testid="floor-missing-image" x={-half} y={-half} width={appearance.size} height={appearance.size} rx="4" />}
    </g>
    {!image && <g className="floor-missing-image-label" pointerEvents="none" aria-hidden="true">
      <ImageOff x={-11} y={-17} width={22} height={22} strokeWidth={1.5} />
      <text y="20" textAnchor="middle" fontSize="10">{t('Nincs kép')}</text>
    </g>}
  </>;
}
