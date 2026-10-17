import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Cloud, FilePlus2, FolderOpen, PencilRuler, Play, WifiOff, X } from 'lucide-react';
import { APP } from '../config';
import { getLocale, t, useLanguage, type Language } from '../i18n';
import type { ProjectSummary } from '../types';
import { Brand } from './Brand';
import { AppearanceControls } from './AppearanceControls';
import './StartScreen.css';

interface NewProjectFormProps {
  onCreate: (name: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function NewProjectForm({ onCreate, onCancel, disabled = false }: NewProjectFormProps) {
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  return <form className="new-project-form" onSubmit={event => { event.preventDefault(); if (name.trim() && !disabled) onCreate(name.trim()); }}>
    <label htmlFor="new-project-name">{t('Projekt neve')}<input ref={input} id="new-project-name" value={name} onChange={event => setName(event.target.value)} required maxLength={160} placeholder={t('Például: Kertvárosi lakás')} disabled={disabled}/></label>
    <div className="new-project-actions"><button type="submit" className="primary" disabled={!name.trim() || disabled}><FilePlus2 size={20}/>{t('Projekt létrehozása')}</button><button type="button" className="quiet" onClick={onCancel} disabled={disabled}><X size={18}/>{t('Mégse')}</button></div>
  </form>;
}

interface StartScreenProps {
  projects: ProjectSummary[];
  busy: boolean;
  online: boolean;
  offlineReady: boolean;
  onCreate: (name: string) => void;
  onOpenFile: () => void;
  onOpenProject: (id: string) => void;
  onTryDemo: () => void;
  onOpenDrive: () => void;
  onUpdate?: () => void;
}

export function StartScreen({ projects, busy, online, offlineReady, onCreate, onOpenFile, onOpenProject, onTryDemo, onOpenDrive, onUpdate }: StartScreenProps) {
  const { language, setLanguage } = useLanguage();
  const [creating, setCreating] = useState(false);
  const newProjectButton = useRef<HTMLButtonElement>(null);
  const openHeading = useRef<HTMLHeadingElement>(null);
  const localProjects = useRef<HTMLElement>(null);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => { if (choosing) openHeading.current?.focus(); }, [choosing]);
  const formatTime = (date: string) => new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
  return <main className="start-screen" aria-labelledby="start-title">
    <header className="start-header"><Brand/><div className="start-preferences"><AppearanceControls/><label className="language-switch" title={t('Felület nyelve')}><select aria-label="Nyelv / Language" value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="hu">Magyar</option><option value="en">English</option></select></label></div>{onUpdate && <div className="start-update" role="status"><span>{t('Új alkalmazásverzió érhető el.')}</span><button className="primary" disabled={busy} onClick={onUpdate}>{t('Frissítés')}</button></div>}</header>
    <div className="start-content">
      <section className="start-intro"><h1 id="start-title">{t('Mivel szeretnél kezdeni?')}</h1><p>{t('Készíts saját villamos tervet, nyiss meg egy mentett projektet, vagy próbáld ki a szerkesztőt egy mintával.')}</p></section>
      <section className="start-actions" aria-label={t('Kezdés')}>
        <button ref={newProjectButton} className="start-action" disabled={busy} onClick={() => { setCreating(true); setChoosing(false); }}><FilePlus2 size={30}/><strong>{t('Új projekt')}</strong><span>{t('Üres terv saját alaprajzzal és elosztóval.')}</span><ArrowRight aria-hidden="true" size={22}/></button>
        <button className="start-action" disabled={busy} onClick={() => { setChoosing(true); setCreating(false); }}><FolderOpen size={30}/><strong>{t('Projekt megnyitása')}</strong><span>{t('Projektfájlból, erről az eszközről vagy a Drive-ról.')}</span><ArrowRight aria-hidden="true" size={22}/></button>
        <button className="start-action" disabled={busy} onClick={onTryDemo}><Play size={30}/><strong>{t('Mintaprojekt kipróbálása')}</strong><span>{t('Saját, szerkeszthető példány a bemutatótervből.')}</span><ArrowRight aria-hidden="true" size={22}/></button>
      </section>
      {creating && <section className="start-panel" aria-labelledby="create-heading"><h2 id="create-heading">{t('Új projekt')}</h2><NewProjectForm onCreate={onCreate} onCancel={() => { setCreating(false); newProjectButton.current?.focus(); }} disabled={busy}/></section>}
      {choosing && <section className="start-panel start-open-options" aria-labelledby="open-heading"><h2 ref={openHeading} tabIndex={-1} id="open-heading">{t('Honnan nyissuk meg?')}</h2><div className="start-open-buttons"><button className="primary" disabled={busy} onClick={onOpenFile}><FolderOpen size={21}/>{t('Projektfájl kiválasztása')}</button><button className="quiet" disabled={busy} onClick={onOpenDrive}><Cloud size={21}/>{t('Google Drive')}</button>{projects.length > 0 && <button className="quiet" disabled={busy} onClick={() => { localProjects.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); localProjects.current?.focus({ preventScroll: true }); }}><PencilRuler size={21}/>{t('Helyi projektek')}</button>}</div><p>{t('Új formátum: {extension}. A korábbi .eplan és elosztó JSON-fájlok is megnyithatók.', { extension: APP.extension })}</p></section>}
      <section ref={localProjects} tabIndex={-1} className="start-projects" aria-labelledby="local-heading"><div className="start-section-heading"><h2 id="local-heading">{t('Ezen az eszközön')}</h2><span>{t('{count} projekt', { count: projects.length })}</span></div>{projects.length ? <ul>{projects.map(project => <li key={project.id}><button disabled={busy} onClick={() => onOpenProject(project.id)}><PencilRuler size={24}/><span><strong>{project.name}</strong><small>{project.site ? `${project.site} · ` : ''}{formatTime(project.updatedAt)}</small></span><span className="start-project-open">{t('Megnyitás')}<ArrowRight size={20}/></span></button></li>)}</ul> : <p className="start-no-projects">{t('Még nincs helyi projekted. A mintaprojekt csak akkor jön létre, ha kiválasztod.')}</p>}</section>
      <footer className="start-footer"><p>{t('A terveid ebben a böngészőben maradnak. Készíts projektfájl- vagy Drive-mentést is.')}</p><span>{!online ? <><WifiOff size={18}/>{t('Offline')}</> : offlineReady ? t('Offline használatra kész') : t('Helyi mentés a saját eszközödön')}</span></footer>
    </div>
  </main>;
}
