import { t } from '../i18n';
import type { Asset, DeviceKind, PlanSheet, ProjectDocument } from '../types';
import { uid } from '../catalog';
import { checkpoint, createProject } from '../data/project';
import { assetFromFile } from '../data/archive';

const MAX_FILE_BYTES = 100 * 1024 * 1024;

function checkFile(file: File) {
  if (file.size > MAX_FILE_BYTES) throw new Error(t('Legfeljebb 100 MB méretű állomány importálható.'));
  if (!file.size) throw new Error(t('A kiválasztott állomány üres.'));
}

export function imageSize(source: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error(t('A kép nem olvasható. PNG vagy JPG állományt válassz.')));
    image.src = source;
  });
}

function blankSheet(name: string, width: number, height: number, assetId?: string): PlanSheet {
  return { id: uid(), name, width, height, backgroundAssetId: assetId, placements: [], routes: [], annotations: [] };
}

/** PDF pages are rasterized once during import; the original document is never sent to a server. */
export async function importBackground(file: File): Promise<{ sheet: PlanSheet; assets: Asset[] }[]> {
  checkFile(file);
  const name = file.name.replace(/\.[^.]+$/, '') || t('Alaprajz');
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const resources = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: `${resources}cmaps/`, cMapPacked: true, standardFontDataUrl: `${resources}standard_fonts/`, wasmUrl: `${resources}wasm/` });
    let pdf: Awaited<typeof task.promise>;
    try { pdf = await task.promise; }
    catch (error) {
      if (error instanceof Error && error.name === 'PasswordException') throw new Error(t('A PDF jelszóval védett. Előbb ments róla jelszó nélküli másolatot.'));
      throw new Error(t('A PDF nem olvasható. Ellenőrizd az állományt.'));
    }
    try {
      if (pdf.numPages > 100) throw new Error(t('Egy importálásban legfeljebb 100 PDF-oldal kezelhető.'));
      const result: { sheet: PlanSheet; assets: Asset[] }[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(3, 2200 / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error(t('A böngésző nem tudja feldolgozni a PDF-oldalt.'));
        await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;
        const asset: Asset = { id: uid(), name: `${name}-${i}.png`, mime: 'image/png', data: canvas.toDataURL('image/png') };
        result.push({ sheet: blankSheet(pdf.numPages > 1 ? t('{name} · {page}. oldal', { name, page: i }) : name, canvas.width, canvas.height, asset.id), assets: [asset] });
        canvas.width = 0; canvas.height = 0; page.cleanup();
      }
      return result;
    } finally { await task.destroy(); }
  }
  if (!['image/png', 'image/jpeg'].includes(file.type) && !/\.(png|jpe?g)$/i.test(file.name)) {
    throw new Error(t('PDF, PNG vagy JPG alaprajz importálható.'));
  }
  const asset = await assetFromFile(file);
  const size = await imageSize(asset.data);
  if (!size.width || !size.height) throw new Error(t('A kép mérete érvénytelen.'));
  return [{ sheet: blankSheet(name, size.width, size.height, asset.id), assets: [asset] }];
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}; }
function string(value: unknown): string { return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''; }
function number(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function array(value: unknown): RecordValue[] { return Array.isArray(value) ? value.map(record) : []; }
function position(value: unknown): { x: number; y: number } {
  if (!Array.isArray(value) || value.length < 2 || !value.slice(0, 2).every(v => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error(t('A Marina állományban egy elem pozíciója hiányzik vagy hibás.'));
  }
  return { x: value[0], y: value[1] };
}

export function marinaKind(type: unknown): DeviceKind {
  const key = string(type).toLocaleUpperCase('hu');
  if (key === 'HUB') return 'hub';
  if (['KAP', 'DIM', 'KAPCSOLÓ'].includes(key)) return 'switch';
  if (['TER', 'NYIT', 'MOZG', 'SZENZOR', 'ÉRZÉKELŐ'].includes(key)) return 'sensor';
  if (['LED', 'LÁMPA', 'LAMPA'].includes(key)) return 'light';
  if (['DUG', 'DUGALJ'].includes(key)) return 'outlet';
  if (['REL', 'RELÉ', 'RELE'].includes(key)) return 'relay';
  return 'custom';
}

/** Maps the actual Marina layer editor format without inventing unrecorded electrical connections. */
export function parseMarina(input: unknown, name = t('Marina · importált terv')): ProjectDocument {
  const source = record(input);
  if (!Array.isArray(source.eszkozok) && !Array.isArray(source.vilagitas) && !Array.isArray(source.szobak)) {
    throw new Error(t('Ez nem Marina rétegállomány: a szobak, eszkozok vagy vilagitas lista hiányzik.'));
  }
  const canvas = record(source.canvas);
  const width = number(canvas.width, 1551), height = number(canvas.height, 891);
  if (width <= 0 || height <= 0 || width > 50000 || height > 50000) throw new Error(t('A Marina rajzlap mérete érvénytelen.'));
  const doc = createProject(name);
  doc.data.devices = []; doc.data.circuits = []; doc.data.boards = [];
  doc.data.sheets = [blankSheet(t('Marina · alaprajz'), width, height)];
  const sheet = doc.data.sheets[0];
  const circuits = new Map<string, string>();
  const colors = ['#e5a33d', '#417bda', '#16a394', '#9b6ad4', '#de6c83', '#55a77b', '#d37339', '#64748b'];
  function circuitId(value: unknown): string | undefined {
    const code = string(value).trim();
    if (!code) return undefined;
    if (!circuits.has(code)) {
      const id = uid(); circuits.set(code, id);
      doc.data.circuits.push({ id, code: `ÁK${code}`, name: t('{code}. áramkör', { code }), color: colors[(circuits.size - 1) % colors.length], notes: t('Marina import: az eredeti áramkörszám alapján.') });
    }
    return circuits.get(code);
  }
  for (const room of array(source.szobak)) {
    sheet.annotations.push({ id: uid(), text: string(room.nev) || string(room.id), ...position(room.pos) });
  }
  const usedCodes = new Set<string>();
  function uniqueCode(code: string) {
    let candidate = code || `E${usedCodes.size + 1}`, suffix = 2;
    while (usedCodes.has(candidate)) candidate = `${code}-${suffix++}`;
    usedCodes.add(candidate); return candidate;
  }
  for (const [collection, kind] of [[array(source.vilagitas), 'light'], [array(source.eszkozok), undefined]] as const) {
    for (const item of collection) {
      const id = uid();
      const sourceType = string(item.tipus);
      doc.data.devices.push({
        id, code: uniqueCode(string(item.id) || string(item.kod)), name: string(item.nev) || sourceType || t('Importált eszköz'),
        kind: kind ?? marinaKind(item.tipus), room: string(item.helyiseg), heightMm: number(item.magassag),
        model: string(item.modell) || (kind === 'light' ? string(item.kod) : ''),
        notes: [string(item.desc), sourceType ? t('Eredeti típus: {type}', { type: sourceType }) : '', string(item.img) ? t('Eredeti képhivatkozás: {image} (helyi fotó külön csatolható)', { image: string(item.img) }) : ''].filter(Boolean).join('\n'),
        status: 'planned', circuitId: circuitId(kind === 'light' ? item.kor : item.aramkor), photoIds: [],
      });
      sheet.placements.push({ deviceId: id, ...position(item.pos), rotation: number(item.rotation) });
    }
  }
  doc.data.notes = t('Marina rétegszerkesztőből importált terv. A szobák feliratként, az áramkörszámok közös áramkörként kerültek át. A forrás nem tartalmaz vezetéknyomvonalakat. A háttérképet és a fotókat külön lehet csatolni.');
  return checkpoint(doc, t('Marina JSON importálása'));
}

export async function importMarina(file: File, background?: File): Promise<ProjectDocument> {
  checkFile(file);
  let input: unknown;
  try { input = JSON.parse(await file.text()); }
  catch { throw new Error(t('A Marina JSON állomány nem olvasható.')); }
  let doc = parseMarina(input, file.name.replace(/\.[^.]+$/, '') || t('Marina · importált terv'));
  if (background) {
    if (background.type === 'application/pdf' || /\.pdf$/i.test(background.name)) throw new Error(t('A Marina importhoz PNG vagy JPG háttérképet válassz.'));
    const [result] = await importBackground(background);
    for (const asset of result.assets) doc.assets[asset.id] = asset;
    doc.data.sheets[0].backgroundAssetId = result.sheet.backgroundAssetId;
    // Original Marina positions use its canvas size; stretching the image preserves those coordinates.
    doc = checkpoint(doc, t('Marina háttérkép csatolása'));
  }
  return doc;
}
