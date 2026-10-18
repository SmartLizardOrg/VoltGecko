import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Cloud,
  FileText,
  FolderOpen,
  Home,
  Menu,
  Redo2,
  Save,
  Settings2,
  Undo2
} from 'lucide-react';
import { t, useLanguage, type Language } from '../i18n';

interface Props {
  projectName: string;
  canUndo: boolean;
  canRedo: boolean;
  onOpenSidebar: () => void;
  onOpenSettings: () => void;
  onHome: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSaveVersion: () => void;
  onConnectFile?: () => void;
  onExportProject: () => void;
  onExportClientPdf: () => void;
  onExportProfessionalPdf: () => void;
  onOpenDrive: () => void;
  onOpenFiles: () => void;
}

export function WorkspaceHeader({
  projectName,
  canUndo,
  canRedo,
  onOpenSidebar,
  onOpenSettings,
  onHome,
  onUndo,
  onRedo,
  onSaveVersion,
  onConnectFile,
  onExportProject,
  onExportClientPdf,
  onExportProfessionalPdf,
  onOpenDrive,
  onOpenFiles
}: Props) {
  const { language, setLanguage } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);
  const runAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };
  return (
    <header className="workspace-header">
      <div className="workspace-title">
        <button
          className="mobile-only icon-button"
          aria-label={t('Eszköztár megnyitása')}
          onClick={() => runAction(onOpenSidebar)}
        >
          <Menu size={21} />
        </button>
        <span className="breadcrumb">
          {t('PROJEKTEK')}
          <ChevronRight size={12} />
        </span>
        <button className="project-title" onClick={() => runAction(onOpenSettings)}>
          {projectName}
          <Settings2 size={14} />
        </button>
        <span className="small-tag draft-tag">{t('TERV')}</span>
      </div>
      <div className="header-actions">
        <button
          className="quiet workspace-home"
          aria-label={t('Kezdőképernyő')}
          title={t('Kezdőképernyő')}
          onClick={() => runAction(onHome)}
        >
          <Home size={19} />
          <span>{t('Kezdőképernyő')}</span>
        </button>
        <label className="language-switch" title={t('Felület nyelve')}>
          <select
            aria-label="Nyelv / Language"
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
          >
            <option value="hu">HU</option>
            <option value="en">EN</option>
          </select>
        </label>
        <div className="undo-group">
          <button
            className="icon-button"
            aria-label={t('Visszavonás')}
            disabled={!canUndo}
            onClick={() => runAction(onUndo)}
          >
            <Undo2 size={18} />
          </button>
          <button className="icon-button" aria-label={t('Újra')} disabled={!canRedo} onClick={() => runAction(onRedo)}>
            <Redo2 size={18} />
          </button>
        </div>
        <button className="quiet save-version-button" onClick={() => runAction(onSaveVersion)}>
          <Save size={16} />
          <span>{t('Verzió mentése')}</span>
        </button>
        <div className="export-dropdown">
          <button className="primary" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
            <ArrowUpRight size={16} />
            <span>{t('Mentés és export')}</span>
            <ChevronDown size={14} />
          </button>
          {menuOpen && (
            <>
              <button
                className="menu-backdrop"
                aria-label={t('Exportmenü bezárása')}
                onClick={() => setMenuOpen(false)}
              />
              <div className="dropdown-menu">
                {onConnectFile && (
                  <button onClick={() => runAction(onConnectFile)}>
                    <Save size={17} />
                    <span>
                      {t('Automatikus mentés fájlba…')}
                      <small>{t('Teljes projektarchívum')}</small>
                    </span>
                  </button>
                )}
                <button onClick={() => runAction(onExportProject)}>
                  <Save size={17} />
                  <span>
                    {t('Projektfájl mentése')}
                    <small>{t('Teljes terv, fotók és előzmények')}</small>
                  </span>
                </button>
                <button onClick={() => runAction(onExportClientPdf)}>
                  <FileText size={17} />
                  <span>
                    {t('PDF a megrendelőnek')}
                    <small>{t('Áttekinthető terv és jelmagyarázat')}</small>
                  </span>
                </button>
                <button onClick={() => runAction(onExportProfessionalPdf)}>
                  <FileText size={17} />
                  <span>
                    {t('Részletes szakmai PDF')}
                    <small>{t('Áramkörök, eszközök és elosztó')}</small>
                  </span>
                </button>
                <button onClick={() => runAction(onOpenDrive)}>
                  <Cloud size={17} />
                  <span>
                    {t('Google Drive')}
                    <small>{t('Saját felhős tárhely')}</small>
                  </span>
                </button>
                <button onClick={() => runAction(onOpenFiles)}>
                  <FolderOpen size={17} />
                  <span>{t('Megnyitás és importálás')}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
