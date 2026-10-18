import { Check } from 'lucide-react';
import { t } from '../i18n';
import type { PlanSheet, ProjectData } from '../types';

interface Props {
  data: ProjectData;
  sheet?: PlanSheet;
  onChange: (data: ProjectData) => void;
  onSheetChange: (id: string) => void;
  onClose: () => void;
}

export function ProjectSettings({ data, sheet, onChange, onSheetChange, onClose }: Props) {
  return (
    <div className="settings-fields">
      <label>
        {t('Projekt neve')}
        <input value={data.name} onChange={(event) => onChange({ ...data, name: event.target.value })} />
      </label>
      <label>
        {t('Helyszín')}
        <input value={data.site} onChange={(event) => onChange({ ...data, site: event.target.value })} />
      </label>
      <label>
        {t('Megrendelő')}
        <input value={data.client} onChange={(event) => onChange({ ...data, client: event.target.value })} />
      </label>
      <label>
        {t('Projekt megjegyzése')}
        <textarea rows={3} value={data.notes} onChange={(event) => onChange({ ...data, notes: event.target.value })} />
      </label>
      {sheet && (
        <>
          <hr />
          <label>
            {t('Aktív tervlap neve')}
            <input
              value={sheet.name}
              onChange={(event) =>
                onChange({
                  ...data,
                  sheets: data.sheets.map((candidate) =>
                    candidate.id === sheet.id ? { ...candidate, name: event.target.value } : candidate
                  )
                })
              }
            />
          </label>
          <button
            className="danger-button"
            onClick={() => {
              if (!confirm(t('Törlöd az aktív tervlapot? Az eszközadatok megmaradnak.'))) return;
              const sheets = data.sheets.filter((candidate) => candidate.id !== sheet.id);
              onChange({ ...data, sheets });
              onSheetChange(sheets[0]?.id ?? '');
              onClose();
            }}
          >
            {t('Aktív tervlap törlése')}
          </button>
        </>
      )}
      <button className="primary" onClick={onClose}>
        <Check size={16} />
        {t('Kész')}
      </button>
    </div>
  );
}
