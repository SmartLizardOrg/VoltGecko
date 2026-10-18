import { strFromU8, strToU8, zipSync } from 'fflate';
import { isProjectFilename } from '../../config';
import type { Asset, ProjectDocument } from '../../types';
import { ARCHIVE_LIMITS, PROJECT_FILE_FORMAT, fail, identifier, object, text } from './format';
import { dataUrl } from './assets';
import { readProjectDocument } from './validation';
import { readZip } from './zip';

export async function encodeProject(document: ProjectDocument): Promise<Blob> {
  const { assetBytes } = readProjectDocument(document, { collectAssetBytes: true });
  const storedAssets: Record<string, { id: string; name: string; mime: string; path: string }> = Object.create(null);
  const files: Record<string, Uint8Array> = {};
  Object.values(document.assets).forEach((asset, index) => {
    const path = `assets/${String(index + 1).padStart(5, '0')}.bin`;
    storedAssets[asset.id] = { id: asset.id, name: asset.name, mime: asset.mime, path };
    files[path] = assetBytes[asset.id];
  });
  const manifest = { ...document, format: PROJECT_FILE_FORMAT, assets: storedAssets };
  const json = strToU8(JSON.stringify(manifest));
  if (json.length > ARCHIVE_LIMITS.jsonBytes) fail('a projekttörténet meghaladja a 30 MB méretet.');
  if (
    json.length + Object.values(assetBytes).reduce((total, bytes) => total + bytes.length, 0) >
    ARCHIVE_LIMITS.expandedBytes
  )
    fail('a kicsomagolt projekt túl nagy.');
  files['project.json'] = json;
  const encoded = zipSync(files, { level: 6 });
  if (encoded.length > ARCHIVE_LIMITS.archiveBytes) fail('a projektfájl meghaladja a 200 MB méretet.');
  return new Blob([new Uint8Array(encoded).buffer], { type: 'application/zip' });
}

export async function decodeProject(file: Blob): Promise<ProjectDocument> {
  if ('name' in file && typeof file.name === 'string' && !isProjectFilename(file.name))
    fail('csak .vgecko projektfájl nyitható meg.');
  if (file.size > ARCHIVE_LIMITS.archiveBytes) fail('a projektfájl meghaladja a 200 MB méretet.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let value: unknown;
  const files = readZip(bytes);
  if (!files['project.json']) fail('hiányzik a project.json leíró.');
  try {
    value = JSON.parse(strFromU8(files['project.json']));
  } catch {
    return fail('a projektleíró nem olvasható.');
  }
  object(value, 'Projekt');
  if (value.format !== PROJECT_FILE_FORMAT) fail('nem VoltGecko projektarchívum.');
  delete value.format;
  object(value.assets, 'Mellékletek');
  const assets: Record<string, Asset> = Object.create(null);
  const usedPaths = new Set<string>();
  for (const [key, entry] of Object.entries(value.assets)) {
    object(entry, 'Melléklet');
    identifier(entry.id, 'Mellékletazonosító');
    text(entry.name, 'Melléklet neve', 2000);
    text(entry.mime, 'Melléklet típusa', 100);
    text(entry.path, 'Melléklet útvonala', 200);
    if (!/^assets\/\d{5}\.bin$/.test(entry.path) || usedPaths.has(entry.path) || !files[entry.path])
      fail('hiányzó vagy ismétlődő mellékletfájl.');
    usedPaths.add(entry.path);
    assets[key] = { id: entry.id, name: entry.name, mime: entry.mime, data: dataUrl(entry.mime, files[entry.path]) };
  }
  if (Object.keys(files).length !== usedPaths.size + 1) fail('a ZIP nem hivatkozott állományt tartalmaz.');
  value.assets = assets;
  return readProjectDocument(value).document;
}
