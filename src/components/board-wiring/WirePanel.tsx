import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { t, getLocale } from '../../i18n';
import { estimateVoltageDrop, wiringEndpointLabel } from '../../data/boardWiring';
import type { BoardWire, Point, ProjectData, WiringEndpoint } from '../../types';
import { CableFields } from '../ElectricalDeviceFields';
import { conductorColors, encodeEndpoint, parseEndpoint } from './endpoints';
import type { EndpointOption } from './endpoints';

interface EndpointSelectProps {
  data: ProjectData;
  endpoints: EndpointOption[];
  value: string;
  onChange: (value: string) => void;
  title: string;
}
export function EndpointSelect({ data, endpoints, value, onChange, title }: EndpointSelectProps) {
  return (
    <label>
      {title}
      <select
        aria-label={title}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        <option value="">{t('Csatlakozópont kiválasztása')}</option>
        {value && !endpoints.some((endpoint) => encodeEndpoint(endpoint.value) === value) && (
          <option value={value}>{wiringEndpointLabel(data, parseEndpoint(value)!)}</option>
        )}
        {data.boards.map((cabinet) => (
          <optgroup key={cabinet.id} label={cabinet.name}>
            {endpoints
              .filter((endpoint) => endpoint.group === cabinet.id)
              .map((endpoint) => (
                <option key={encodeEndpoint(endpoint.value)} value={encodeEndpoint(endpoint.value)}>
                  {endpoint.text}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export interface WireEstimate {
  wireId: string;
  current?: number;
  voltage: number;
  threePhase: boolean;
}

interface Props {
  data: ProjectData;
  wires: BoardWire[];
  selectedWireId?: string;
  selectedRoute: Point[];
  endpoints: EndpointOption[];
  onSelectWire: (id: string) => void;
  onPatchWire: (id: string, patch: Partial<BoardWire>) => void;
  onDeleteWire: (id: string) => void;
  onClearError: () => void;
  estimate?: WireEstimate;
  onEstimateChange: (estimate: WireEstimate) => void;
}

export function WirePanel({
  data,
  wires,
  selectedWireId,
  selectedRoute,
  endpoints,
  onSelectWire,
  onPatchWire,
  onDeleteWire,
  onClearError,
  estimate,
  onEstimateChange
}: Props) {
  const selectedWire = wires.find((wire) => wire.id === selectedWireId);
  const label = (endpoint: WiringEndpoint) => wiringEndpointLabel(data, endpoint);
  const endpointSelect = (value: string, onChange: (value: string) => void, title: string) => (
    <EndpointSelect
      data={data}
      endpoints={endpoints}
      value={value}
      title={title}
      onChange={(value) => {
        onChange(value);
        onClearError();
      }}
    />
  );
  const currentEndpoint =
    selectedWire?.to.kind === 'device'
      ? selectedWire.to
      : selectedWire?.from.kind === 'device'
        ? selectedWire.from
        : undefined;
  const currentDevice = currentEndpoint
    ? data.devices.find((device) => device.id === currentEndpoint.deviceId)
    : undefined;
  const settings =
    estimate && estimate.wireId === selectedWire?.id
      ? estimate
      : {
          wireId: selectedWire?.id ?? '',
          current: currentDevice?.electrical?.currentA,
          voltage: 230,
          threePhase: false
        };
  const setEstimateValue = (patch: Partial<WireEstimate>) => onEstimateChange({ ...settings, ...patch });
  const current = settings.current;
  const drop =
    selectedWire && current !== undefined
      ? estimateVoltageDrop(selectedWire.cable, current, settings.voltage, settings.threePhase)
      : undefined;
  return (
    <div className="wiring-panel">
      <h4>{t('Vezetékek')}</h4>
      {!wires.length && <p className="subtle">{t('Még nincs részletes vezeték.')}</p>}
      <div className="wiring-wire-list">
        {wires.map((wire) => (
          <button
            key={wire.id}
            className={selectedWireId === wire.id ? 'selected' : ''}
            aria-pressed={selectedWireId === wire.id}
            onClick={() => onSelectWire(wire.id)}
          >
            <i style={{ background: wire.color ?? conductorColors.L }} />
            <span>{wire.label || `${label(wire.from)} → ${label(wire.to)}`}</span>
          </button>
        ))}
      </div>
      {selectedWire && (
        <div className="wiring-wire-editor">
          <strong>
            {label(selectedWire.from)} → {label(selectedWire.to)}
          </strong>
          {endpointSelect(
            encodeEndpoint(selectedWire.from),
            (value) => {
              if (value) onPatchWire(selectedWire.id, { from: parseEndpoint(value)! });
            },
            t('Kijelölt vezeték kezdőpontja')
          )}
          {endpointSelect(
            encodeEndpoint(selectedWire.to),
            (value) => {
              if (value) onPatchWire(selectedWire.id, { to: parseEndpoint(value)! });
            },
            t('Kijelölt vezeték végpontja')
          )}
          <label>
            {t('Vezeték felirata')}
            <input
              aria-label={t('Vezeték felirata')}
              value={selectedWire.label ?? ''}
              onChange={(e) => onPatchWire(selectedWire.id, { label: e.target.value })}
            />
          </label>
          <label className="wiring-color-field">
            {t('Vezeték színe')}
            <input
              aria-label={t('Vezeték színe')}
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(selectedWire.color ?? '') ? selectedWire.color : conductorColors.L}
              onChange={(e) => onPatchWire(selectedWire.id, { color: e.target.value })}
            />
          </label>
          <CableFields cable={selectedWire.cable} onChange={(cable) => onPatchWire(selectedWire.id, { cable })} />
          <fieldset className="wiring-cable">
            <legend>{t('Feszültségesés-becslés')}</legend>
            <div className="wiring-field-grid">
              <label>
                {t('Becsült terhelőáram (A)')}
                <input
                  aria-label={t('Becsült terhelőáram (A)')}
                  type="number"
                  min="0"
                  step="any"
                  value={current ?? ''}
                  onChange={(e) =>
                    setEstimateValue({
                      current: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value))
                    })
                  }
                />
              </label>
              <label>
                {t('Névleges feszültség (V)')}
                <input
                  aria-label={t('Névleges feszültség (V)')}
                  type="number"
                  min="1"
                  step="any"
                  value={settings.voltage}
                  onChange={(e) => {
                    const voltage = Number(e.target.value);
                    if (voltage > 0) setEstimateValue({ voltage });
                  }}
                />
              </label>
            </div>
            <label>
              {t('Számítási rendszer')}
              <select
                aria-label={t('Számítási rendszer')}
                value={settings.threePhase ? 'three' : 'single'}
                onChange={(e) => setEstimateValue({ threePhase: e.target.value === 'three' })}
              >
                <option value="single">{t('Egyfázisú, oda-vissza vezető')}</option>
                <option value="three">{t('Szimmetrikus háromfázisú')}</option>
              </select>
            </label>
          </fieldset>
          <p className="subtle">
            {drop
              ? t('Becsült feszültségesés: {volts} V ({percent}%), {current} A terhelőárammal.', {
                  volts: drop.volts.toLocaleString(getLocale(), { maximumFractionDigits: 2 }),
                  percent: drop.percent.toLocaleString(getLocale(), { maximumFractionDigits: 2 }),
                  current: current!
                })
              : t(
                  'Feszültségesés-becsléshez add meg a gyártói ellenállást, a hosszt és a kapcsolódó készülék névleges áramát.'
                )}
          </p>
          <details>
            <summary>{t('Nyomvonal és felirat helye')}</summary>
            {selectedRoute.slice(1, -1).map((point, index) => (
              <div className="wiring-coordinate" key={index}>
                <span>{t('{number}. töréspont', { number: index + 1 })}</span>
                {(['x', 'y'] as const).map((axis) => (
                  <label key={axis}>
                    {axis}
                    <input
                      aria-label={t('{number}. töréspont {axis}', { number: index + 1, axis })}
                      type="number"
                      value={point[axis]}
                      onChange={(e) => {
                        const points = selectedRoute.slice(1, -1);
                        points[index] = { ...points[index], [axis]: Number(e.target.value) };
                        onPatchWire(selectedWire.id, { points });
                      }}
                    />
                  </label>
                ))}
                <button
                  className="icon-button"
                  aria-label={t('{number}. töréspont törlése', { number: index + 1 })}
                  onClick={() =>
                    onPatchWire(selectedWire.id, { points: selectedRoute.slice(1, -1).filter((_, i) => i !== index) })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              className="quiet"
              onClick={() =>
                onPatchWire(selectedWire.id, {
                  points: [
                    ...selectedRoute.slice(1, -1),
                    {
                      x: (selectedRoute[0].x + selectedRoute.at(-1)!.x) / 2,
                      y: (selectedRoute[0].y + selectedRoute.at(-1)!.y) / 2
                    }
                  ]
                })
              }
            >
              <Plus size={14} />
              {t('Töréspont hozzáadása')}
            </button>
            <div className="wiring-coordinate">
              <span>{t('Felirat helye')}</span>
              {(['x', 'y'] as const).map((axis) => (
                <label key={axis}>
                  {axis}
                  <input
                    aria-label={t('Felirat {axis}', { axis })}
                    type="number"
                    value={selectedWire.labelOffset?.[axis] ?? 0}
                    onChange={(e) =>
                      onPatchWire(selectedWire.id, {
                        labelOffset: {
                          x: selectedWire.labelOffset?.x ?? 0,
                          y: selectedWire.labelOffset?.y ?? 0,
                          [axis]: Number(e.target.value)
                        }
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <div className="row-actions">
            <button
              className="quiet"
              onClick={() => onPatchWire(selectedWire.id, { points: undefined, labelOffset: undefined })}
            >
              <RotateCcw size={14} />
              {t('Nyomvonal alaphelyzetbe')}
            </button>
            <button
              className="danger-button"
              onClick={() => {
                onDeleteWire(selectedWire.id);
              }}
            >
              <Trash2 size={14} />
              {t('Vezeték törlése')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
