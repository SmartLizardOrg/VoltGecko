import { t, getLanguage } from '../i18n';
import type { ProjectDocument } from '../types';
import { decodeProject, encodeProject } from '../data/archive';
import { APP, isProjectFilename, stripProjectExtension } from '../config';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '';
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY?.trim() || '';
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID?.trim() || CLIENT_ID.split('-')[0];
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const APP_MARKER = 'electric-planner-local-v1';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken(options: { prompt: string }): void }
interface PickerData { action: string; docs?: { id: string; name?: string }[] }
interface PickerBuilder {
  setDeveloperKey(key: string): PickerBuilder; setAppId(id: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder; addView(view: unknown): PickerBuilder;
  setCallback(callback: (data: PickerData) => void): PickerBuilder;
  setTitle(title: string): PickerBuilder; setLocale(locale: string): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}
interface GoogleWindow {
  google?: {
    accounts: { oauth2: {
      initTokenClient(config: { client_id: string; scope: string; callback(response: TokenResponse): void; error_callback(error: { type?: string }): void }): TokenClient;
      revoke(token: string, callback?: () => void): void;
    } };
    picker?: {
      PickerBuilder: new () => PickerBuilder;
      DocsView: new () => { setIncludeFolders(include: boolean): unknown };
      Action: { PICKED: string; CANCEL: string };
    };
  };
  gapi?: { load(module: string, options: { callback(): void; onerror(): void; timeout: number; ontimeout(): void }): void };
}
const googleWindow = () => window as unknown as GoogleWindow;
let token: string | undefined;
let tokenExpiresAt = 0;
let folderId: string | undefined;
const scripts = new Map<string, Promise<void>>();

function loadScript(url: string): Promise<void> {
  const loaded = scripts.get(url);
  if (loaded) return loaded;
  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url; script.async = true; script.defer = true;
    const timeout = window.setTimeout(() => { script.remove(); scripts.delete(url); reject(new Error(t('A Google betöltése nem válaszol. Ellenőrizd az internetkapcsolatot, majd próbáld újra.'))); }, 20000);
    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = () => { clearTimeout(timeout); script.remove(); scripts.delete(url); reject(new Error(t('A Google nem tölthető be. Ellenőrizd az internetkapcsolatot vagy a tartalomblokkolót.'))); };
    document.head.appendChild(script);
  });
  scripts.set(url, loading); return loading;
}

export function isDriveConfigured(): boolean { return Boolean(CLIENT_ID && !CLIENT_ID.includes('YOUR_')); }
export function isDriveConnected(): boolean { return Boolean(token && Date.now() < tokenExpiresAt); }

export async function connectDrive(): Promise<void> {
  if (!isDriveConfigured()) throw new Error(t('A Google Drive még nincs beállítva. A helyi fájlmentés már használható; a fejlesztői beállítást a README írja le.'));
  if (!navigator.onLine) throw new Error(t('A Google Drive csatlakoztatásához internetkapcsolat kell.'));
  if (isDriveConnected()) return;
  await loadScript('https://accounts.google.com/gsi/client');
  const oauth = googleWindow().google?.accounts.oauth2;
  if (!oauth) throw new Error(t('A Google bejelentkezési modul nem érhető el.'));
  await new Promise<void>((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE,
      callback: response => {
        if (response.error || !response.access_token) { reject(new Error(response.error === 'access_denied' ? t('A Drive-hozzáférést nem engedélyezted.') : t('A Google-csatlakozás sikertelen. Próbáld újra.'))); return; }
        token = response.access_token;
        tokenExpiresAt = Date.now() + Math.max(0, Number(response.expires_in || 3600) - 60) * 1000;
        folderId = undefined; resolve();
      },
      error_callback: error => reject(new Error(error.type === 'popup_closed' ? t('A Google bejelentkezési ablak bezárult.') : t('A Google ablaka nem nyitható meg. Engedélyezd a felugró ablakot, és kattints újra a csatlakozásra.'))),
    });
    client.requestAccessToken({ prompt: 'select_account' });
  });
}

function requireToken(): string {
  if (!isDriveConnected()) { token = undefined; throw new Error(t('A Google Drive kapcsolata lejárt. A folytatáshoz csatlakozz újra.')); }
  return token!;
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${requireToken()}`);
  let response: Response;
  try { response = await fetch(url, { ...init, headers }); }
  catch { throw new Error(t('A Drive nem érhető el. A projekt helyben továbbra is menthető; ellenőrizd az internetet.')); }
  if (response.status === 401) { token = undefined; tokenExpiresAt = 0; throw new Error(t('A Google Drive kapcsolata lejárt. Csatlakozz újra.')); }
  if (!response.ok) {
    if (response.status === 403) throw new Error(t('A Google Drive megtagadta a műveletet. Ellenőrizd a fájl jogosultságát és a Drive API engedélyezését.'));
    if (response.status === 404) throw new Error(t('A Drive-fájl nem található, vagy ehhez a fiókhoz nincs hozzáférés.'));
    if (response.status === 429) throw new Error(t('A Google Drive átmenetileg túl sok kérést kapott. Próbáld újra később.'));
    throw new Error(t('A Drive-művelet sikertelen ({status}). A helyi projekt megmaradt.', { status: response.status }));
  }
  return response;
}

interface DriveFile { id: string; name: string; modifiedTime: string }
async function listFiles(query: string, fields = 'files(id,name,modifiedTime),nextPageToken'): Promise<DriveFile[]> {
  const result: DriveFile[] = [];
  let nextPageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: query, fields, pageSize: '100', orderBy: 'modifiedTime desc', spaces: 'drive' });
    if (nextPageToken) params.set('pageToken', nextPageToken);
    const response = await driveFetch(`${DRIVE}?${params}`);
    const body = await response.json() as { files?: DriveFile[]; nextPageToken?: string };
    result.push(...body.files || []); nextPageToken = body.nextPageToken;
  } while (nextPageToken);
  return result;
}

export function safeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim().replace(/[. ]+$/, '').slice(0, 100) || t('villamos-terv');
}

async function ensureFolder(): Promise<string> {
  if (folderId) return folderId;
  const existing = await listFiles(`trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='plannerFolder' and value='${APP_MARKER}' }`);
  if (existing.length) { folderId = existing[0].id; return folderId; }
  const response = await driveFetch(DRIVE, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: t('{app} · projektek', { app: t(APP.name) }), mimeType: 'application/vnd.google-apps.folder', appProperties: { plannerFolder: APP_MARKER } }),
  });
  folderId = (await response.json() as { id: string }).id; return folderId;
}

export function listDriveProjects(): Promise<DriveFile[]> {
  return listFiles(`trashed = false and mimeType != 'application/vnd.google-apps.folder' and appProperties has { key='plannerApp' and value='${APP_MARKER}' }`);
}

/** Every save creates a complete immutable snapshot; no other user's version is overwritten. */
export async function saveToDrive(doc: ProjectDocument): Promise<void> {
  requireToken();
  const parent = await ensureFolder();
  const now = new Date().toISOString();
  const snapshot = structuredClone(doc); snapshot.lastDriveSaveAt = now;
  const blob = await encodeProject(snapshot);
  const metadata = {
    name: `${safeFilename(stripProjectExtension(doc.data.name))} · ${now.replace(/[:.]/g, '-')}${APP.extension}`,
    parents: [parent], mimeType: 'application/octet-stream',
    appProperties: { plannerApp: APP_MARKER, projectId: doc.data.id, revisionId: doc.headRevisionId || 'working-copy', parentRevisionId: doc.revisions.find(r => r.id === doc.headRevisionId)?.parentId || '' },
  };
  // Resumable upload keeps metadata and file bytes separate and also supports photo-heavy projects.
  const session = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/octet-stream' }, body: JSON.stringify(metadata),
  });
  const location = session.headers.get('Location');
  if (!location || !location.startsWith('https://www.googleapis.com/')) throw new Error(t('A Drive feltöltési munkamenete nem indítható.'));
  await driveFetch(location, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
}

export async function openFromDrive(id: string): Promise<ProjectDocument> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(t('Érvénytelen Drive-fájlazonosító.'));
  const response = await driveFetch(`${DRIVE}/${encodeURIComponent(id)}?alt=media`);
  return decodeProject(await response.blob());
}

export async function pickDriveProject(): Promise<ProjectDocument> {
  requireToken();
  if (!API_KEY) throw new Error(t('A megosztott fájlok Google-választója még nincs beállítva (VITE_GOOGLE_API_KEY). A saját Drive-mentések listából megnyithatók.'));
  await loadScript('https://apis.google.com/js/api.js');
  const gapi = googleWindow().gapi;
  if (!gapi) throw new Error(t('A Google fájlválasztó nem tölthető be.'));
  await new Promise<void>((resolve, reject) => gapi.load('picker', {
    callback: resolve, onerror: () => reject(new Error(t('A Google fájlválasztó nem tölthető be.'))), timeout: 20000,
    ontimeout: () => reject(new Error(t('A Google fájlválasztó nem válaszol.'))),
  }));
  const picker = googleWindow().google?.picker;
  if (!picker) throw new Error(t('A Google fájlválasztó nem érhető el.'));
  const id = await new Promise<string>((resolve, reject) => {
    const builder = new picker.PickerBuilder()
      .setDeveloperKey(API_KEY).setAppId(APP_ID).setOAuthToken(requireToken())
      .addView(new picker.DocsView().setIncludeFolders(true))
      .setTitle(t('{app} · .vgecko projekt kiválasztása', { app: t(APP.name) })).setLocale(getLanguage())
      .setCallback(data => {
        if (data.action === picker.Action.PICKED && data.docs?.[0]) {
          const file = data.docs[0];
          if (file.name && !isProjectFilename(file.name)) { reject(new Error(t('A fájlválasztóban .vgecko vagy korábbi .eplan projektállományt válassz.'))); return; }
          resolve(file.id);
        } else if (data.action === picker.Action.CANCEL) reject(new Error(t('A fájlválasztást megszakítottad.')));
      });
    builder.build().setVisible(true);
  });
  return openFromDrive(id);
}

export function disconnectDrive(): void {
  const previous = token; token = undefined; tokenExpiresAt = 0; folderId = undefined;
  if (previous) googleWindow().google?.accounts.oauth2.revoke(previous);
}
