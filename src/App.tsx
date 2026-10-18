import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDownToLine, ArrowUpRight, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Cloud, Download, FileImage, FileText, FolderOpen, GitBranch, History, Home, LayoutGrid, LoaderCircle, Menu, MousePointer2, PencilRuler, Plus, Redo2, Save, Search, Settings2, SlidersHorizontal, Undo2, Upload, WifiOff, X, Zap } from 'lucide-react';
import { APP } from './config';
import { t, useLanguage, getLocale, type Language } from './i18n';
import { CATALOG, makeDevice, uid, kindLabel } from './catalog';
import type { DeviceKind, Point, ProjectData, ProjectDocument, ProjectSummary } from './types';
import { checkpoint, createDemoProject, createProject, deleteDevice, resolveImport, restoreRevision } from './data/project';
import { deleteProject, listProjects, loadProject, saveProject } from './data/storage';
import { assetFromFile, decodeProject, saveProjectFile } from './data/archive';
import { FloorPlan } from './components/FloorPlan';
import { DeviceSymbol } from './components/Symbol';
import { BoardEditor } from './components/BoardEditor';
import { Inspector } from './components/Inspector';
import { Circuits } from './components/Circuits';
import { SingleLine } from './components/SingleLine';
import { Brand } from './components/Brand';
import { AppearanceControls } from './components/AppearanceControls';
import { StartScreen, NewProjectForm } from './components/StartScreen';
import { LinkedFileControl, type LinkedFileActions } from './components/LinkedFileControl';
import { projectFilePicker } from './services/linkedFile';
import { isLegacyBoard, importLegacyBoard } from './services/legacyBoard';
import { ProductLibrary } from './components/ProductLibrary';
import { SCHNEIDER_PRODUCTS } from './products/schneider';
import { addProductToProject } from './products/factory';
import type { CatalogProduct } from './products/types';
import { connectDrive, disconnectDrive, isDriveConfigured, isDriveConnected, listDriveProjects, openFromDrive, pickDriveProject, saveToDrive } from './services/drive';
type View = 'floor' | 'board' | 'single-line' | 'circuits' | 'history';
type Modal = 'projects' | 'new-project' | 'files' | 'settings' | 'help' | 'drive' | null;
type Tool = DeviceKind | 'select' | 'route' | 'control' | 'note' | 'scale';
const fmt = (s?: string) => s ? new Intl.DateTimeFormat(getLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(s)) : t("még nincs");
const errorMessage = (e: unknown) => e instanceof Error ? e.message : t("A művelet nem sikerült.");
const importBackground: typeof import('./services/import').importBackground = async (file) => (await import('./services/import')).importBackground(file);
const importMarina: typeof import('./services/import').importMarina = async (file, background) => (await import('./services/import')).importMarina(file, background);
const exportPdf: typeof import('./services/pdf').exportPdf = async (doc, audience) => (await import('./services/pdf')).exportPdf(doc, audience);
export default function App() {
    const { language, setLanguage } = useLanguage();
    const [doc, setDoc] = useState<ProjectDocument | null>(null);
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [view, setView] = useState<View>('floor');
    const [sheetId, setSheetId] = useState('');
    const [boardId, setBoardId] = useState('');
    const [productLibraryOpen,setProductLibraryOpen] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [tool, setTool] = useState<Tool>('select');
    const [modal, setModal] = useState<Modal>(null);
    const [menu, setMenu] = useState(false);
    const [sidebar, setSidebar] = useState(false);
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState('');
    const [toast, setToast] = useState('');
    useEffect(() => { setToast(''); }, [language]);
    const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saving');
    const [online, setOnline] = useState(navigator.onLine);
    const [offlineReady, setOfflineReady] = useState(false);
    const [historyNote, setHistoryNote] = useState('');
    const [driveFiles, setDriveFiles] = useState<{
        id: string;
        name: string;
        modifiedTime: string;
    }[]>([]);
    const [driveConnected, setDriveConnected] = useState(false);
    const [marinaJson, setMarinaJson] = useState<File | null>(null);
    const [marinaBackground, setMarinaBackground] = useState<File | null>(null);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [fatal, setFatal] = useState('');
    const undo = useRef<ProjectData[]>([]), redo = useRef<ProjectData[]>([]);
    const docRef = useRef<ProjectDocument | null>(null);
    const savedRef = useRef<ProjectDocument | null>(null);
    const busyRef = useRef('');
    const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const updateFn = useRef<(() => Promise<void>) | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const backgroundInput = useRef<HTMLInputElement>(null);
    const linkedFileActions=useRef<LinkedFileActions>(null);
    const modalRegion = useRef<HTMLElement>(null);
    const busyRegion = useRef<HTMLDivElement>(null);
    docRef.current = doc;
    const notify = (text: string) => { setToast(text); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 5500); };
    const refreshProjects = async () => setProjects(await listProjects());
    const switchDocument = (next: ProjectDocument) => { undo.current = []; redo.current = []; docRef.current = next; setDoc(next); setSheetId(next.data.sheets[0]?.id ?? ''); setBoardId(next.data.boards[0]?.id ?? ''); setSelectedId(null); setTool('select'); setModal(null); setSidebar(false); localStorage.setItem('planner.activeProject', next.data.id); };
    const perform = async (label: string, fn: () => Promise<void>) => { if (busyRef.current)
        return; busyRef.current = label; setBusy(label); try {
        await fn();
    }
    catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError')
            return;
        notify(errorMessage(e));
    }
    finally {
        setDriveConnected(isDriveConnected());
        busyRef.current = '';
        setBusy('');
    } };
    useEffect(() => { let cancelled = false; (async () => { try {
        const all = await listProjects();
        if (cancelled)
            return;
        if (!cancelled) {
            setProjects(all);
            setLoading(false);
        }
    }
    catch (e) {
        if (!cancelled)
            setFatal(errorMessage(e));
    } })(); return () => { cancelled = true; }; }, []);
    useEffect(() => { if (!doc)
        return; setSaveState('saving'); void saveProject(doc).then(() => { if (docRef.current === doc) {
        savedRef.current = doc;
        setSaveState('saved');
    } }).catch(e => { if (docRef.current !== doc)
        return; setSaveState('error'); notify(t("Helyi mentési hiba: {p0}. Ments projektfájlt.", { p0: errorMessage(e) })); }); }, [doc]);
    useEffect(() => { const preventUnsaved = (event: BeforeUnloadEvent) => { if (docRef.current && docRef.current !== savedRef.current) {
        event.preventDefault();
        event.returnValue = '';
    } }; window.addEventListener('beforeunload', preventUnsaved); return () => window.removeEventListener('beforeunload', preventUnsaved); }, []);
    useEffect(() => {
        const region = busy ? busyRegion.current : modal ? modalRegion.current : null;
        if (!region) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusable = () => Array.from(region.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
        const frame = requestAnimationFrame(() => {
            const preferred = modal === 'new-project' && !busy ? region.querySelector<HTMLInputElement>('#new-project-name') : null;
            (preferred ?? focusable()[0] ?? region).focus();
        });
        const trapFocus = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') return;
            const controls = focusable(), first = controls[0], last = controls[controls.length - 1];
            if (!first) { event.preventDefault(); region.focus(); return; }
            if (event.shiftKey && (document.activeElement === first || !region.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !region.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', trapFocus);
        return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', trapFocus); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
    }, [modal, busy]);
    useEffect(() => { const on = () => setOnline(navigator.onLine); window.addEventListener('online', on); window.addEventListener('offline', on); const update = (event: Event) => { updateFn.current = (event as CustomEvent).detail; setUpdateAvailable(true); }; window.addEventListener('app-update', update); if ('serviceWorker' in navigator)
        navigator.serviceWorker.ready.then(() => setOfflineReady(true)).catch(() => { }); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); window.removeEventListener('app-update', update); }; }, []);
    useEffect(() => { const listener = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (busyRef.current)
            return;
        const d = docRef.current;
        if (d) {
            const next = checkpoint(d, t("Gyors mentés"));
            docRef.current = next;
            setDoc(next);
            notify(t("Új változat elmentve."));
        }
        return;
    } if (busyRef.current)
        return; if (e.key === 'Escape') {
        setModal(null);
        setMenu(false);
        setSidebar(false);
        setTool('select');
    } }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, []);
    const changeData = (data: ProjectData) => { const current = docRef.current; if (!current)
        return; undo.current.push(structuredClone(current.data)); if (undo.current.length > 50)
        undo.current.shift(); redo.current = []; const next = { ...current, data, updatedAt: new Date().toISOString() }; docRef.current = next; setDoc(next); };
    const goUndo = () => { if (!doc)
        return; const prev = undo.current.pop(); if (prev) {
        redo.current.push(structuredClone(doc.data));
        setDoc({ ...doc, data: prev, updatedAt: new Date().toISOString() });
        setSelectedId(null);
    } };
    const goRedo = () => { if (!doc)
        return; const next = redo.current.pop(); if (next) {
        undo.current.push(structuredClone(doc.data));
        setDoc({ ...doc, data: next, updatedAt: new Date().toISOString() });
    } };
    const newProject = async (name: string) => { if (!name.trim())
        return; if (doc)
        await saveProject(doc); const next = createProject(name.trim()); await saveProject(next); switchDocument(next); setView('floor'); await refreshProjects(); };
    const openLocalProject = async (id: string) => { const current = docRef.current; if (current) await saveProject(current); const loaded = await loadProject(id); if (!loaded) throw new Error(t('A projekt már nem található ezen az eszközön.')); switchDocument(loaded); setView('floor'); };
    const tryDemo = async () => { const current = docRef.current; if (current) await saveProject(current); const demo = createDemoProject(); await saveProject(demo); switchDocument(demo); setView('floor'); await refreshProjects(); };
    const showStart = async () => { const current = docRef.current; if (current) { await saveProject(current); savedRef.current = current; } await refreshProjects(); setModal(null); setMenu(false); setSidebar(false); setProductLibraryOpen(false); setSelectedId(null); docRef.current = null; setDoc(null); };
    const loadImported = async (incoming: ProjectDocument) => { const current = docRef.current; if (current)
        await saveProject(current); const existing = await loadProject(incoming.data.id); const result = resolveImport(incoming, existing); await saveProject(result.document); switchDocument(result.document); setView('floor'); await refreshProjects(); notify(result.message); };
    const importFile = (file: File) => perform(t("Projekt megnyitása…"), async () => {
      if (/\.json$/i.test(file.name) && file.size <= 30 * 1024 * 1024) {
        let raw: unknown; try { raw = JSON.parse(await file.text()); } catch { /* The standard decoder supplies the file error. */ }
        if (isLegacyBoard(raw)) { await loadImported(importLegacyBoard(raw)); setView('board'); return; }
      }
      await loadImported(await decodeProject(file));
    });
    const exportFile = () => { if (!doc)
        return; setMenu(false); void perform(t("Projektfájl készítése…"), async () => { const next = checkpoint(doc, t("Projektfájl mentése")); setDoc(next); await saveProjectFile(next); const saved = { ...next, lastExternalSaveAt: new Date().toISOString() }; setDoc(saved); await saveProject(saved); notify(t("A teljes projektfájl elkészült, az előzményekkel és mellékletekkel.")); }); };
    const addBackground = (files: FileList) => { const selected = Array.from(files); void perform(t("Alaprajz feldolgozása…"), async () => { const results = []; for (const file of selected)
        results.push(...await importBackground(file)); const current = docRef.current; if (!current)
        return; const next = structuredClone(current); for (const result of results) {
        next.data.sheets.push(result.sheet);
        result.assets.forEach(a => { next.assets[a.id] = a; });
    } next.updatedAt = new Date().toISOString(); undo.current.push(structuredClone(current.data)); redo.current = []; setDoc(next); setSheetId(results[0]?.sheet.id ?? sheetId); setView('floor'); notify(t("{p0} tervlap hozzáadva.", { p0: results.length })); }); };
    const addManufacturerProduct = (product:CatalogProduct) => { const current=docRef.current;if(!current)return;try{const result=addProductToProject(current.data,product,boardId);changeData(result.data);setBoardId(result.boardId);setView('board');setTool('select');setSelectedId(result.selectedId);setSidebar(false);notify(result.placed?t('{reference} hozzáadva.',{reference:product.reference}):t('Nincs elegendő szabad modulhely. A készülék az eszközlistában megmaradt, elhelyezésre vár.'));}catch(error){notify(errorMessage(error));} };
    const addDevice = (kind: DeviceKind, targetSheetId: string, point: Point) => { if (!doc)
        return; const next = structuredClone(doc.data); const d = makeDevice(kind, next.devices); next.devices.push(d); const sheet = next.sheets.find(s => s.id === targetSheetId); sheet?.placements.push({ deviceId: d.id, x: point.x, y: point.y, rotation: 0 }); changeData(next); setSelectedId(d.id); setTool('select'); };
    const chooseCatalog = (kind: DeviceKind) => { if (!doc)
        return; if (view !== 'board') {
        setView('floor');
        setTool(kind);
        setSidebar(false);
        notify(t("Érintsd meg az eszköz helyét az alaprajzon."));
        return;
    } const next = structuredClone(doc.data); const device = makeDevice(kind, next.devices); next.devices.push(device); const board = next.boards.find(b => b.id === boardId) ?? next.boards[0]; const row = board?.rows[0]; if (row) {
        let start = 0;
        const width = device.moduleWidth ?? 1;
        while (start + width <= row.capacity && row.placements.some(p => { const w = next.devices.find(d => d.id === p.deviceId)?.moduleWidth ?? 1; return start < p.start + w && p.start < start + width; }))
            start += .5;
        row.placements.push({ deviceId: device.id, start });
    } changeData(next); setSelectedId(device.id); setSidebar(false); };
    const addPhoto = (files: FileList) => { const id = selectedId; void perform(t("Fotók mentése…"), async () => { const photos = []; for (const file of Array.from(files)) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
            throw new Error(t("PNG, JPG vagy WebP fotó választható."));
        if (file.size > 15 * 1024 * 1024)
            throw new Error(t("Egy fotó legfeljebb 15 MB lehet."));
        photos.push(await assetFromFile(file));
    } const current = docRef.current; if (!current)
        return; const next = structuredClone(current); const d = next.data.devices.find(d => d.id === id); if (!d)
        return; photos.forEach(a => { next.assets[a.id] = a; if (!d.photoIds.includes(a.id))
        d.photoIds.push(a.id); }); next.updatedAt = new Date().toISOString(); setDoc(next); notify(t("A fotók a helyi projekthez kerültek.")); }); };
    const removeDevice = (id: string) => { if (!doc || !confirm(t("Törlöd ezt az eszközt és a hozzá tartozó rajzi kapcsolatokat? A művelet visszavonható.")))
        return; changeData(deleteDevice(doc.data, id)); setSelectedId(null); };
    const locate = (id: string) => { if (!doc)
        return; const s = doc.data.sheets.find(s => s.placements.some(p => p.deviceId === id)); if (s) {
        setSheetId(s.id);
        setView('floor');
    }
    else {
        const b = doc.data.boards.find(b => b.rows.some(r => r.placements.some(p => p.deviceId === id)));
        if (b) {
            setBoardId(b.id);
            setView('board');
        }
    } setSelectedId(id); setSidebar(false); };
    const saveVersion = () => { if (!doc)
        return; setDoc(checkpoint(doc, historyNote.trim() || t("Mentett változat"))); setHistoryNote(''); notify(t("A változat bekerült az előzményekbe.")); };
    const openDrive = () => { setModal('drive'); if (driveConnected)
        void perform(t("Drive projektek betöltése…"), async () => setDriveFiles(await listDriveProjects())); };
    if (fatal)
        return <div className="boot-screen"><WifiOff size={40}/><h1>{t("A helyi tárhely nem érhető el")}</h1><p>{fatal}</p><p>{t("Normál böngészőablakban engedélyezd a webhely adattárolását.")}</p><button className="primary" onClick={() => location.reload()}>{t("Újrapróbálás")}</button></div>;
    if (loading)
        return <div className="boot-screen"><Brand/><LoaderCircle className="spin"/><p>{t("A helyi munkatér megnyitása…")}</p></div>;
    const data = doc?.data;
    const sheet = data?.sheets.find(s => s.id === sheetId) ?? data?.sheets[0];
    const device = data?.devices.find(d => d.id === selectedId) ?? null;
    const catalog = CATALOG.filter(c => c.category === (view === 'board' ? 'board' : 'floor'));
    const filtered = data?.devices.filter(d => `${d.code} ${d.name} ${d.room}`.toLocaleLowerCase(getLocale()).includes(query.toLocaleLowerCase('hu'))) ?? [];
    const nav = [{ id: 'floor', label: t("Alaprajz"), icon: PencilRuler }, { id: 'board', label: t("Elosztó"), icon: LayoutGrid }, { id: 'single-line', label: t("Egyvonalas"), icon: GitBranch }, { id: 'circuits', label: t("Áramkörök"), icon: Zap }, { id: 'history', label: t("Előzmények"), icon: History }] as const;
    return <>{!doc && <StartScreen projects={projects} busy={Boolean(busy)} online={online} offlineReady={offlineReady} onCreate={name => void perform(t('Új projekt…'), () => newProject(name))} onOpenFile={() => fileInput.current?.click()} onOpenProject={id => void perform(t('Projekt megnyitása…'), () => openLocalProject(id))} onTryDemo={() => void perform(t('Mintaprojekt…'), tryDemo)} onOpenDrive={openDrive} onUpdate={updateAvailable ? () => void perform(t("Frissítés"), async () => { await updateFn.current?.(); }) : undefined}/>}
    {doc && data && <div className={`app-shell ${sidebar ? 'sidebar-open' : ''} ${selectedId ? 'selection-open' : ''}`}>
    <aside className="sidebar"><div className="brand brand-voltgecko"><Brand/><button className="mobile-only icon-button" aria-label={t("Eszköztár bezárása")} onClick={() => setSidebar(false)}><X size={18}/></button></div>
      <button className="project-switch" onClick={() => { setModal('projects'); void refreshProjects(); }}><span className="project-avatar">{data.name.slice(0, 1).toUpperCase()}</span><span><strong>{data.name}</strong><small>{data.site || t("Saját projekt")}</small></span><ChevronDown size={15}/></button>
      <div className="nav-label">{t("MUNKANÉZETEK")}</div><nav className="main-nav">{nav.map(n => <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => { setView(n.id); setTool('select'); setSidebar(false); }}><n.icon size={18}/>{n.label}{n.id === 'circuits' && <span>{data.circuits.length}</span>}{n.id === 'history' && <span>{doc.revisions.length}</span>}</button>)}</nav>
      <div className="sidebar-divider"/><button className="manufacturer-library-button" onClick={event=>{event.currentTarget.focus();setProductLibraryOpen(true);setSidebar(false);}}><BookOpen size={20}/><span><strong>Schneider Electric</strong><small>{t("Schneider terméktár")} · {SCHNEIDER_PRODUCTS.length}</small></span></button>{(view === 'floor' || view === 'board') && <><div className="nav-label">{view === 'board' ? t("KÉSZÜLÉKTÁR") : t("ESZKÖZTÁR")}<span>{t("KATTINTS A HOZZÁADÁSHOZ")}</span></div><div className="catalog-grid">{catalog.map(c => <button key={c.kind} title={c.description} className={tool === c.kind ? 'chosen' : ''} onClick={() => chooseCatalog(c.kind)}><DeviceSymbol kind={c.kind} size={25}/><span>{c.label}</span>{c.moduleWidth && <small>{c.moduleWidth} M</small>}</button>)}</div></>}
      <div className="device-library"><div className="nav-label">{t("A TERV ESZKÖZEI")}<span>{data.devices.length}</span></div><div className="search-box"><Search size={14}/><input aria-label={t("Eszköz keresése")} placeholder={t("Keresés az eszközök között")} value={query} onChange={e => setQuery(e.target.value)}/></div><div className="device-list">{filtered.map(d => <button key={d.id} className={selectedId === d.id ? 'active' : ''} onClick={() => locate(d.id)}><span className="device-list-code" style={{ '--circuit-color': data.circuits.find(c => c.id === d.circuitId)?.color } as CSSProperties}>{d.code}</span><span>{d.name}<small>{d.room || kindLabel(d.kind)}</small></span><ChevronRight size={13}/></button>)}{!filtered.length && <p className="subtle">{t("Nincs ilyen eszköz.")}</p>}</div></div>
      <div className="sidebar-bottom"><AppearanceControls/><button onClick={() => setModal('help')}><CircleHelp size={17}/>{t("Útmutató és adatkezelés")}</button><span>v{APP.version}<span className="local-dot"/>{t("Saját adatok. Saját eszköz.")}</span></div>
    </aside>
    {sidebar && <button className="sidebar-backdrop" aria-label={t("Eszköztár bezárása")} onClick={() => setSidebar(false)}/>}
    <main className="workspace"><header className="workspace-header"><div className="workspace-title"><button className="mobile-only icon-button" aria-label={t("Eszköztár megnyitása")} onClick={() => setSidebar(true)}><Menu size={21}/></button><span className="breadcrumb">{t("PROJEKTEK")}<ChevronRight size={12}/></span><button className="project-title" onClick={() => setModal('settings')}>{data.name}<Settings2 size={14}/></button><span className="small-tag draft-tag">{t("TERV")}</span></div><div className="header-actions"><button className="quiet workspace-home" aria-label={t("Kezdőképernyő")} title={t("Kezdőképernyő")} onClick={() => void perform(t("Mentés és kezdőképernyő…"), showStart)}><Home size={19}/><span>{t("Kezdőképernyő")}</span></button><label className="language-switch" title={t("Felület nyelve")}><select aria-label="Nyelv / Language" value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="hu">HU</option><option value="en">EN</option></select></label><div className="undo-group"><button className="icon-button" aria-label={t("Visszavonás")} disabled={!undo.current.length} onClick={goUndo}><Undo2 size={18}/></button><button className="icon-button" aria-label={t("Újra")} disabled={!redo.current.length} onClick={goRedo}><Redo2 size={18}/></button></div><button className="quiet save-version-button" onClick={saveVersion}><Save size={16}/><span>{t("Verzió mentése")}</span></button><div className="export-dropdown"><button className="primary" onClick={() => setMenu(!menu)}><ArrowUpRight size={16}/><span>{t("Mentés és export")}</span><ChevronDown size={14}/></button>{menu && <><button className="menu-backdrop" aria-label={t("Exportmenü bezárása")} onClick={() => setMenu(false)}/><div className="dropdown-menu">{projectFilePicker()&&<button onClick={()=>{setMenu(false);linkedFileActions.current?.connect();}}><Save size={17}/><span>{t("Automatikus mentés fájlba…")}<small>{t("Teljes projektarchívum")}</small></span></button>}<button onClick={exportFile}><Save size={17}/><span>{t("Projektfájl mentése")}<small>{t("Teljes terv, fotók és előzmények")}</small></span></button><button onClick={() => { setMenu(false); void perform(t("Ügyfél-PDF készítése…"), () => exportPdf(doc, 'client')); }}><FileText size={17}/><span>{t("PDF a megrendelőnek")}<small>{t("Áttekinthető terv és jelmagyarázat")}</small></span></button><button onClick={() => { setMenu(false); void perform(t("Részletes PDF készítése…"), () => exportPdf(doc, 'professional')); }}><FileText size={17}/><span>{t("Részletes szakmai PDF")}<small>{t("Áramkörök, eszközök és elosztó")}</small></span></button><button onClick={() => { setMenu(false); openDrive(); }}><Cloud size={17}/><span>{t("Google Drive")}<small>{t("Saját felhős tárhely")}</small></span></button><button onClick={() => { setMenu(false); setModal('files'); }}><FolderOpen size={17}/><span>{t("Megnyitás és importálás")}</span></button></div></>}</div></div></header>
      {updateAvailable && <div className="update-banner"><span>{t("Új alkalmazásverzió érhető el.")}</span><button onClick={() => void perform(t("Mentés és frissítés…"), async () => { await saveProject(doc); await updateFn.current?.(); })}>{t("Mentés és frissítés")}</button></div>}
      <LinkedFileControl key={doc.data.id} ref={linkedFileActions} document={doc} onNotify={notify}/>
      <div className="workspace-toolbar"><div className="view-tabs">{nav.filter(n=>n.id!=='history').map(n => <button className={view === n.id ? 'active' : ''} key={n.id} onClick={() => { setView(n.id); setTool('select'); }}><n.icon size={16}/>{n.label}</button>)}</div><div className="toolbar-right">{view==='board'&&<button className="quiet" aria-label={t("Schneider terméktár")} onClick={event=>{event.currentTarget.focus();setProductLibraryOpen(true);}}><BookOpen size={16}/><span>{t("Schneider terméktár")}</span></button>}{view === 'floor' && <><button className="quiet" onClick={() => backgroundInput.current?.click()}><FileImage size={16}/><span>{t("Alaprajz betöltése")}</span></button><button className="icon-button" title={t("Üres tervlap hozzáadása")} aria-label={t("Üres tervlap hozzáadása")} onClick={() => { const name = prompt(t("Az új tervlap neve:"), t("Új tervlap")); if (!name?.trim())
        return; const id = uid(); changeData({ ...data, sheets: [...data.sheets, { id, name: name.trim(), width: 1200, height: 800, placements: [], routes: [], annotations: [] }] }); setSheetId(id); }}><Plus size={17}/></button></>}<button className="icon-button" aria-label={t("Projektbeállítások")} onClick={() => setModal('settings')}><SlidersHorizontal size={17}/></button></div></div>
      {view === 'floor' && <div className="plan-heading"><div><span className="eyebrow">{t("VILLAMOS ELHELYEZÉSI TERV")}</span><select aria-label={t("Aktív tervlap")} value={sheet?.id ?? ''} onChange={e => { setSheetId(e.target.value); setSelectedId(null); }}>{data.sheets.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></div><span className="sheet-count">{t("{count} eszköz",{count:sheet?.placements.length??0})}<span>·</span> {sheet?.mmPerUnit ? t("1 egység = {p0} mm", { p0: sheet.mmPerUnit.toLocaleString(getLocale(),{maximumFractionDigits:2}) }) : t("Méretarány nincs beállítva")}</span></div>}
      <div className={`editor-area ${view === 'floor' ? 'floor-area' : ''}`}>
        {view === 'floor' && (sheet ? <FloorPlan key={sheet.id} data={data} assets={doc.assets} sheetId={sheet.id} selectedId={selectedId} tool={tool} onSelect={setSelectedId} onChange={changeData} onAddDevice={addDevice} onNotify={notify} tools={<div className="drawing-tools" aria-label={t("Rajzeszközök")}>{[{ id: 'select', icon: MousePointer2, label: t("Kijelölés és mozgatás") }, { id: 'route', icon: Zap, label: t("Kapcsolat / nyomvonal") }, { id: 'control', icon: Settings2, label: t("Vezérlési kapcsolat") }, { id: 'note', icon: FileText, label: t("Megjegyzés a rajzon") }, { id: 'scale', icon: PencilRuler, label: t("Méretarány beállítása") }].map(drawingTool => <button key={drawingTool.id} aria-label={drawingTool.label} title={drawingTool.label} className={tool === drawingTool.id ? 'active' : ''} onClick={() => { setTool(drawingTool.id as Tool); if (drawingTool.id !== 'select')
        setSelectedId(null); if (drawingTool.id === 'route' || drawingTool.id === 'control')
        notify(t("Válaszd ki a kapcsolat két eszközét.")); if (drawingTool.id === 'scale')
        notify(t("Jelölj ki két pontot egy ismert távolsághoz.")); }}><drawingTool.icon size={19}/></button>)}</div>}/> : <div className="empty"><FileImage size={40}/><h2>{t("Kezdj egy alaprajzzal")}</h2><p>{t("Tölts be PDF-et vagy képet, vagy hozz létre üres tervlapot.")}</p><button className="primary" onClick={() => backgroundInput.current?.click()}>{t("Alaprajz betöltése")}</button></div>)}
        {view === 'board' && <BoardEditor data={data} boardId={boardId} onBoardChange={setBoardId} selectedId={selectedId} onSelect={setSelectedId} onChange={changeData} onNotify={notify}/>}
        {view === 'single-line' && <SingleLine data={data} boardId={boardId} onBoardChange={setBoardId} onSelect={setSelectedId}/>}
        {view === 'circuits' && <Circuits data={data} onChange={changeData} onSelect={setSelectedId}/>}
        {view === 'history' && <div className="history-view"><div className="section-heading"><div><span className="eyebrow">{t("A MUNKA TÖRTÉNETE")}</span><h2>{t("Előzmények")}</h2><p>{t("Mentett állapotok, amelyekhez később is visszatérhetsz.")}</p></div><span className="large-count">{doc.revisions.length}</span></div><div className="revision-compose"><input aria-label={t("Verzió megjegyzése")} placeholder={t("Mi változott? Pl. konyhai dugaljak pontosítva")} value={historyNote} onChange={e => setHistoryNote(e.target.value)}/><button className="primary" onClick={saveVersion}><Plus size={16}/>{t("Verzió mentése")}</button></div><div className="timeline">{[...doc.revisions].reverse().map((r, i) => <article key={r.id}><span className={`timeline-dot ${i === 0 ? 'current' : ''}`}/><div><span className="eyebrow">{fmt(r.createdAt)}{r.id === doc.headRevisionId ? t(" · AKTUÁLIS ELŐZMÉNY") : ''}</span><h3>{r.note || t("Mentett változat")}</h3><p>{t("{devices} eszköz · {circuits} áramkör · {sheets} tervlap",{devices:r.data.devices.length,circuits:r.data.circuits.length,sheets:r.data.sheets.length})}{r.restoredFrom ? t(" · Visszaállításból") : ''}</p></div><button className="quiet" onClick={() => { if (confirm(t("Visszaállítod ezt az állapotot? A jelenlegi munkáról is készül egy mentett változat."))) {
        const current = checkpoint(doc, t("Visszaállítás előtti állapot"));
        setDoc(restoreRevision(current, r.id));
        setSelectedId(null);
        undo.current = [];
        redo.current = [];
        notify(t("Új változat készült a visszaállított állapotból."));
    } }}><History size={15}/>{t("Visszaállítás")}</button></article>)}</div></div>}
      </div>
      <footer className="statusbar"><span className={saveState === 'error' ? 'danger-text' : ''}>{saveState === 'saving' ? <LoaderCircle size={13} className="spin"/> : <Check size={13}/>} {saveState === 'saving' ? t("Helyi mentés…") : saveState === 'error' ? t("Mentési hiba") : t("Ezen az eszközön mentve")}</span><span className="external-status">{t("Fájl:")}{" "}{fmt(doc.lastExternalSaveAt)} <span>·</span>{t("Drive:")}{" "}{fmt(doc.lastDriveSaveAt)}</span><span>{!online ? <><WifiOff size={13}/>{t("Offline")}</> : <><span className="local-dot"/>{offlineReady ? t("Offline használatra kész") : t("Helyi fejlesztés")}</>}</span></footer>
    </main>
    <Inspector data={data} assets={doc.assets} device={device} onChange={changeData} onClose={() => setSelectedId(null)} onDelete={removeDevice} onPhoto={addPhoto} onLocate={locate}/>
    </div>}
    <input ref={fileInput} className="hidden" type="file" accept=".vgecko,.eplan,.json,.zip" onChange={e => { const f = e.target.files?.[0]; if (f)
        void importFile(f); e.target.value = ''; }}/>
    <input ref={backgroundInput} className="hidden" type="file" accept="application/pdf,image/png,image/jpeg" multiple onChange={e => { if (e.target.files)
        addBackground(e.target.files); e.target.value = ''; }}/>
    {toast && <div role="status" className="toast"><Check size={17}/><span>{toast}</span><button className="icon-button" aria-label={t("Értesítés bezárása")} onClick={() => setToast('')}><X size={15}/></button></div>}
    {busy && <div ref={busyRegion} className="busy-overlay" role="status" tabIndex={-1}><LoaderCircle className="spin" size={25}/><span>{busy}</span></div>}
    {productLibraryOpen&&<ProductLibrary products={SCHNEIDER_PRODUCTS} onAdd={addManufacturerProduct} onClose={()=>setProductLibraryOpen(false)}/>}
    {modal && <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget)
            setModal(null); }}><section ref={modalRegion} role="dialog" aria-modal="true" tabIndex={-1} aria-label={{ projects: t('Projektek'), 'new-project': t('Új projekt'), files: t("Megnyitás és importálás"), settings: t("Projektbeállítások"), help: t("Útmutató és adatkezelés"), drive: t("Google Drive") }[modal]} className={`modal modal-${modal}`}><div className="modal-heading"><div><span className="eyebrow">{t(APP.name)}</span><h2>{{ projects: t("Saját projektek"), "new-project": t("Új projekt"), files: t("Megnyitás és importálás"), settings: t("Projektbeállítások"), help: t("Jó tervvel könnyebb a helyszínen."), drive: t("Google Drive") }[modal]}</h2></div><button className="icon-button" aria-label={t("Ablak bezárása")} onClick={() => setModal(null)}><X size={21}/></button></div>
      {modal === 'new-project' && <NewProjectForm onCreate={name => void perform(t('Új projekt…'), () => newProject(name))} onCancel={() => setModal('projects')} disabled={Boolean(busy)}/>}
      {modal === 'projects' && <><p className="subtle">{t("Ezeket a projekteket ezen az eszközön tárolod.")}</p><div className="modal-button-row"><button className="primary" onClick={() => setModal("new-project")}><Plus size={16}/>{t("Új projekt")}</button><button className="quiet" onClick={() => setModal('files')}><FolderOpen size={16}/>{t("Fájl megnyitása")}</button><button className="quiet" onClick={() => void perform(t('Mintaprojekt…'), tryDemo)}>{t("Új mintaprojekt")}</button></div><div className="project-list">{projects.map(p => <article key={p.id}><button onClick={() => void perform(t("Projekt megnyitása…"), () => openLocalProject(p.id))}><span className="project-file-icon"><PencilRuler size={22}/></span><span><strong>{p.name}</strong><small>{p.site || t('Helyi projekt')} · {fmt(p.updatedAt)}</small></span><ChevronRight size={17}/></button>{p.id !== data?.id && <button className="icon-button danger-hover" aria-label={t("{p0} projekt törlése", { p0: p.name })} onClick={() => { if (confirm(t("Végleg törlöd a helyi projektet és annak előzményeit? A külső fájlok megmaradnak.")))
            void perform(t("Projekt törlése…"), async () => { await deleteProject(p.id); await refreshProjects(); }); }}><X size={16}/></button>}</article>)}</div></>}
      {modal === 'files' && <><div className="import-options"><button onClick={() => fileInput.current?.click()}><FolderOpen size={27}/><strong>{t("Projektfájl megnyitása")}</strong><span>{t(".vgecko, korábbi .eplan vagy elosztó JSON v2/v3")}</span></button><button onClick={() => backgroundInput.current?.click()}><FileImage size={27}/><strong>{t("Alaprajz betöltése")}</strong><span>{t("PDF, PNG vagy JPG · új tervlapként")}</span></button></div><div className="marina-import"><h3>{t("Korábbi Marina terv átvétele")}</h3><p>{t("A régi szerkesztő JSON-fájlját és a hozzá tartozó háttérképet külön választhatod ki.")}</p><label>{t("Marina JSON")}<input type="file" accept=".json" onChange={e => setMarinaJson(e.target.files?.[0] ?? null)}/></label><label>{t("Alaprajzi háttérkép (választható)")}<input type="file" accept="image/png,image/jpeg" onChange={e => setMarinaBackground(e.target.files?.[0] ?? null)}/></label><button className="quiet" disabled={!marinaJson} onClick={() => void perform(t("Marina terv importálása…"), async () => { if (marinaJson)
            await loadImported(await importMarina(marinaJson, marinaBackground ?? undefined)); })}><Upload size={16}/>{t("Marina terv importálása")}</button></div></>}
      {modal === 'settings' && doc && data && <div className="settings-fields"><label>{t("Projekt neve")}<input value={data.name} onChange={e => changeData({ ...data, name: e.target.value })}/></label><label>{t("Helyszín")}<input value={data.site} onChange={e => changeData({ ...data, site: e.target.value })}/></label><label>{t("Megrendelő")}<input value={data.client} onChange={e => changeData({ ...data, client: e.target.value })}/></label><label>{t("Projekt megjegyzése")}<textarea rows={3} value={data.notes} onChange={e => changeData({ ...data, notes: e.target.value })}/></label>{sheet && <><hr /><label>{t("Aktív tervlap neve")}<input value={sheet.name} onChange={e => changeData({ ...data, sheets: data.sheets.map(s => s.id === sheet.id ? { ...s, name: e.target.value } : s) })}/></label><button className="danger-button" onClick={() => { if (confirm(t("Törlöd az aktív tervlapot? Az eszközadatok megmaradnak."))) {
            changeData({ ...data, sheets: data.sheets.filter(s => s.id !== sheet.id) });
            setSheetId(data.sheets.find(s => s.id !== sheet.id)?.id ?? '');
            setModal(null);
        } }}>{t("Aktív tervlap törlése")}</button></>}<button className="primary" onClick={() => setModal(null)}><Check size={16}/>{t("Kész")}</button></div>}
      {modal === 'help' && <div className="help-content"><p className="lead">{t("Az alaprajz, az áramkörök és az elosztó ugyanannak a tervnek a nézetei.")}</p><ol><li><strong>{t("Tölts be alaprajzot.")}</strong>{" "}{t("PDF-ből minden oldal külön tervlap lesz. Üres lapon is kezdhetsz.")}</li><li><strong>{t("Helyezd el az eszközöket.")}</strong>{" "}{t("Válassz az eszköztárból, majd érintsd meg a rajzot. A jobb oldali adatlapon pontosítsd az adatokat.")}</li><li><strong>{t("Kapcsold össze a tervet.")}</strong>{" "}{t("Hozz létre áramköröket, rendeld hozzá az eszközöket és a védelmeket. A kapcsolat eszközzel két eszközt köthetsz össze.")}</li><li><strong>{t("Állítsd össze az elosztót.")}</strong>{" "}{t("A készüléktárból kattintással hozzáadhatsz elemeket; a sor és a kezdő modulhely kézzel is módosítható.")}</li><li><strong>{t("Ments külső példányt.")}</strong>{" "}{t("A projektfájl az összes képet és előzményt tartalmazza. A PDF az átadásra szolgál.")}</li></ol><div className="field-note"><Cloud size={20}/><p><strong>{t("Adatok és offline használat")}</strong><br />{t("A projekt automatikusan ebbe a böngészőbe mentődik. Böngészőadat-törléskor vagy tárhelyfelszabadításkor elveszhet a helyi példány, ezért készíts fájl- vagy Drive-mentést. A Google csak csatlakoztatás után érhető el; saját szerverre nem küldünk projektadatot.")}</p></div><button className="quiet" onClick={() => void perform(t("Tárhelybeállítás…"), async () => { const granted = await navigator.storage?.persist?.(); notify(granted ? t("A böngésző tartós tárolást engedélyezett.") : t("A böngésző nem engedélyezett tartós tárolást. A projektfájl-mentés továbbra is elérhető.")); })}>{t("Tartós helyi tárolás kérése")}</button><h3>{t("Jelmagyarázat és szakmai ellenőrzés")}</h3><p>{t("A beépített jelek saját SVG-rajzok; a kiinduló jelkönyvtár szakmai hitelesítése még szükséges. Az egyedi okosotthon-jelek funkciót jelölnek. A készülékadatokat és a modulszélességet a gyártói adatok alapján töltsd ki.")}</p><p>{t("Ez a változat eszköz- és áramkörszintű dokumentálást végez. A megadott védelmeket és vezetékadatokat a szakember választja ki.")}</p><h3>{t("Telepítés és frissítés")}</h3><p>{t("A build localhoston, illetve megbízható HTTPS-kapcsolaton telepíthető. iPhone-on a Safari megosztás menüjében válaszd a Főképernyőhöz adást. Az első letöltés után várd meg az „Offline használatra kész” jelzést.")}</p><p className="subtle">{t(APP.name)} · {APP.version}{t("· Helyi, ingyenes fejlesztői változat")}</p></div>}
      {modal === 'drive' && <div className="drive-content"><div className="field-note"><Cloud size={25}/><p><strong>{t("A saját Google Drive-odban.")}</strong><br />{t("Minden mentés külön teljes projektváltozat. Megnyitás után a terv internet nélkül is szerkeszthető.")}</p></div>{!isDriveConfigured() ? <><h3>{t("A Google-kapcsolat még nincs beállítva")}</h3><p>{t("A helyi fájlmentés már használható. A fejlesztői Google-kapcsolathoz az")}{" "}<code>.env.example</code>{" "}{t("alapján állítsd be az OAuth kliensazonosítót, majd indítsd újra az alkalmazást.")}</p>{doc && <button className="primary" onClick={exportFile}><Download size={16}/>{t("Projektfájl mentése")}</button>}</> : <><div className="modal-button-row">{!driveConnected ? <button className="primary" disabled={!online} onClick={() => void perform(t("Google csatlakoztatása…"), async () => { await connectDrive(); setDriveConnected(true); setDriveFiles(await listDriveProjects()); })}><Cloud size={17}/>{t("Google Drive csatlakoztatása")}</button> : <>{doc && <button className="primary" disabled={!online} onClick={() => void perform(t("Google Drive mentés…"), async () => { const next = checkpoint(doc, t("Google Drive mentés")); setDoc(next); await saveToDrive(next); const saved = { ...next, lastDriveSaveAt: new Date().toISOString() }; setDoc(saved); await saveProject(saved); setDriveFiles(await listDriveProjects()); notify(t("Új projektváltozat került a saját Drive-odra.")); })}><Cloud size={17}/>{t("Aktuális terv mentése")}</button>}<button className="quiet" onClick={() => void perform(t("Drive megnyitása…"), async () => loadImported(await pickDriveProject()))}><FolderOpen size={16}/>{t("Megosztott fájl kiválasztása")}</button><button className="quiet" onClick={() => { disconnectDrive(); setDriveConnected(false); setDriveFiles([]); }}>{t("Leválasztás")}</button></>}</div>{!online && <p className="input-warning">{t("A Drive eléréséhez internetkapcsolat szükséges. A helyi terv szerkeszthető.")}</p>}<div className="drive-file-list">{driveFiles.map(f => <button key={f.id} onClick={() => void perform(t("Drive projekt megnyitása…"), async () => loadImported(await openFromDrive(f.id)))}><FileText size={20}/><span><strong>{f.name}</strong><small>{fmt(f.modifiedTime)}</small></span><ArrowDownToLine size={17}/></button>)}{driveConnected && !driveFiles.length && <p className="subtle">{t("Még nincs az alkalmazással mentett projekt a Drive-odon.")}</p>}</div></>}</div>}
    </section></div>}
  </>;
}
