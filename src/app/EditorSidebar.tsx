import { useState, type CSSProperties } from 'react';
import { BookOpen, ChevronDown, ChevronRight, CircleHelp, Search, X } from 'lucide-react';
import { APP } from '../config';
import { CATALOG, kindLabel } from '../catalog';
import { getLocale, t } from '../i18n';
import { AppearanceControls } from '../components/AppearanceControls';
import { Brand } from '../components/Brand';
import { DeviceSymbol } from '../components/Symbol';
import type { FloorPlanProps } from '../components/FloorPlan';
import type { DeviceKind, ProjectDocument } from '../types';
import { getNavigation, type View } from './navigation';

interface Props {
  document: ProjectDocument;
  view: View;
  tool: FloorPlanProps['tool'];
  selectedId: string | null;
  onViewChange: (view: View) => void;
  onClose: () => void;
  onProjectsOpen: () => void;
  onProductsOpen: () => void;
  onHelpOpen: () => void;
  onChooseCatalog: (kind: DeviceKind) => void;
  onLocate: (id: string) => void;
}

export function EditorSidebar({
  document: doc,
  view,
  tool,
  selectedId,
  onViewChange,
  onClose,
  onProjectsOpen,
  onProductsOpen,
  onHelpOpen,
  onChooseCatalog,
  onLocate
}: Props) {
  const [query, setQuery] = useState('');
  const { data } = doc;
  const nav = getNavigation();
  const catalog = CATALOG.filter((entry) => entry.category === (view === 'board' ? 'board' : 'floor'));
  const search = query.toLocaleLowerCase(getLocale());
  const filtered = data.devices.filter((device) =>
    `${device.code} ${device.name} ${device.room}`.toLocaleLowerCase(getLocale()).includes(search)
  );
  return (
    <aside className="sidebar">
      <div className="brand brand-voltgecko">
        <Brand />
        <button className="mobile-only icon-button" aria-label={t('Eszköztár bezárása')} onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <button className="project-switch" onClick={onProjectsOpen}>
        <span className="project-avatar">{data.name.slice(0, 1).toUpperCase()}</span>
        <span>
          <strong>{data.name}</strong>
          <small>{data.site || t('Saját projekt')}</small>
        </span>
        <ChevronDown size={15} />
      </button>
      <div className="nav-label">{t('MUNKANÉZETEK')}</div>
      <nav className="main-nav">
        {nav.map((n) => (
          <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => onViewChange(n.id)}>
            <n.icon size={18} />
            {n.label}
            {n.id === 'circuits' && <span>{data.circuits.length}</span>}
            {n.id === 'history' && <span>{doc.revisions.length}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-divider" />
      <button
        className="manufacturer-library-button"
        onClick={(event) => {
          event.currentTarget.focus();
          onProductsOpen();
        }}
      >
        <BookOpen size={20} />
        <span>
          <strong>Schneider Electric</strong>
          <small>{t('Schneider terméktár')}</small>
        </span>
      </button>
      {(view === 'floor' || view === 'board') && (
        <>
          <div className="nav-label">
            {view === 'board' ? t('KÉSZÜLÉKTÁR') : t('ESZKÖZTÁR')}
            <span>{t('KATTINTS A HOZZÁADÁSHOZ')}</span>
          </div>
          <div className="catalog-grid">
            {catalog.map((c) => (
              <button
                key={c.kind}
                title={c.description}
                className={tool === c.kind ? 'chosen' : ''}
                onClick={() => onChooseCatalog(c.kind)}
              >
                <DeviceSymbol kind={c.kind} size={25} />
                <span>{c.label}</span>
                {c.moduleWidth && <small>{c.moduleWidth} M</small>}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="device-library">
        <div className="nav-label">
          {t('A TERV ESZKÖZEI')}
          <span>{data.devices.length}</span>
        </div>
        <div className="search-box">
          <Search size={14} />
          <input
            aria-label={t('Eszköz keresése')}
            placeholder={t('Keresés az eszközök között')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="device-list">
          {filtered.map((d) => (
            <button key={d.id} className={selectedId === d.id ? 'active' : ''} onClick={() => onLocate(d.id)}>
              <span
                className="device-list-code"
                style={{ '--circuit-color': data.circuits.find((c) => c.id === d.circuitId)?.color } as CSSProperties}
              >
                {d.code}
              </span>
              <span>
                {d.name}
                <small>{d.room || kindLabel(d.kind)}</small>
              </span>
              <ChevronRight size={13} />
            </button>
          ))}
          {!filtered.length && <p className="subtle">{t('Nincs ilyen eszköz.')}</p>}
        </div>
      </div>
      <div className="sidebar-bottom">
        <AppearanceControls />
        <button onClick={onHelpOpen}>
          <CircleHelp size={17} />
          {t('Útmutató és adatkezelés')}
        </button>
        <span>
          v{APP.version}
          <span className="local-dot" />
          {t('Saját adatok. Saját eszköz.')}
        </span>
      </div>
    </aside>
  );
}
