import { t } from '../i18n';
import type { Asset, PlanSheet } from '../types';
import { uid } from '../catalog';
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
