import { strFromU8 } from 'fflate';
import { uid } from '../../catalog';
import { t } from '../../i18n';
import type { Asset } from '../../types';
import { ARCHIVE_LIMITS, fail, identifier, object, text } from './format';

const assetMimes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
  'application/pdf'
]);

const passiveSvgTags = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'title',
  'desc',
  'symbol',
  'use',
  'image'
]);
const passiveSvgAttributes = new Set([
  'xmlns',
  'xmlns:xlink',
  'id',
  'class',
  'viewbox',
  'width',
  'height',
  'x',
  'y',
  'dx',
  'dy',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'x2',
  'y1',
  'y2',
  'd',
  'points',
  'transform',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-stretch',
  'letter-spacing',
  'word-spacing',
  'text-anchor',
  'dominant-baseline',
  'alignment-baseline',
  'textlength',
  'lengthadjust',
  'shape-rendering',
  'vector-effect',
  'preserveaspectratio',
  'gradientunits',
  'gradienttransform',
  'stop-color',
  'stop-opacity',
  'offset',
  'clip-path',
  'clip-rule',
  'mask',
  'patternunits',
  'patterncontentunits',
  'patterntransform',
  'href',
  'xlink:href'
]);

function assertSafeSvg(bytes: Uint8Array) {
  const unsafe = (): never =>
    fail('az SVG aktív, külső vagy nem támogatott tartalmat tartalmaz. Használj PNG vagy JPG képet.');
  // A small, explicit passive subset avoids relying on browser-specific SVG
  // execution rules. In particular, CSS/animation could mutate safe references.
  const svg = strFromU8(bytes)
    .replace(/^\uFEFF/, '')
    .replace(/^\s*<\?xml\s[^?]*\?>/i, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  if (/<!|<\?|@import/i.test(svg)) unsafe();
  const stack: string[] = [];
  let rootSeen = false;
  const remainder = svg.replace(
    /<\s*(\/?)\s*([A-Za-z][\w:.-]*)([^<>]*)>/g,
    (_match, closing: string, tag: string, raw: string) => {
      if (!passiveSvgTags.has(tag)) return unsafe();
      if (closing) {
        if (raw.trim() || stack.pop() !== tag) return unsafe();
        return '';
      }
      if (!stack.length) {
        if (rootSeen || tag !== 'svg') return unsafe();
        rootSeen = true;
      }
      const selfClosing = /\/\s*$/.test(raw);
      const attributes = selfClosing ? raw.replace(/\/\s*$/, '') : raw;
      const seenAttributes = new Set<string>();
      const leftover = attributes.replace(
        /([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/g,
        (_attribute, originalName: string, _quote: string, rawValue: string) => {
          const name = originalName.toLowerCase();
          if (!passiveSvgAttributes.has(name) || seenAttributes.has(name)) return unsafe();
          seenAttributes.add(name);
          let value = rawValue
            .replace(
              /&#(?:x([0-9a-f]+)|(\d+));/gi,
              (_entity, hexadecimal: string | undefined, decimal: string | undefined) => {
                const code = Number.parseInt(hexadecimal ?? decimal!, hexadecimal ? 16 : 10);
                if (!Number.isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return unsafe();
                return String.fromCodePoint(code);
              }
            )
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&')
            .trim();
          if (name === 'xmlns') {
            if (value !== 'http://www.w3.org/2000/svg') return unsafe();
            return '';
          }
          if (name === 'xmlns:xlink') {
            if (value !== 'http://www.w3.org/1999/xlink') return unsafe();
            return '';
          }
          if (name === 'href' || name === 'xlink:href') {
            if (
              !/^#[\w:.-]+$/.test(value) &&
              !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
            )
              return unsafe();
            return '';
          }
          // Reject escaped CSS tokens and every URL except a local paint reference.
          if (/\\|(?:https?|ftp|file|javascript|vbscript|data):|\/\//i.test(value)) return unsafe();
          value = value.replace(/url\(\s*["']?#[\w:.-]+["']?\s*\)/gi, '');
          if (/url\s*\(|@import/i.test(value)) return unsafe();
          return '';
        }
      );
      if (leftover.trim()) return unsafe();
      if (!selfClosing) stack.push(tag);
      return '';
    }
  );
  if (!rootSeen || stack.length || /[<>]/.test(remainder)) unsafe();
}

function decodeDataUrl(asset: Pick<Asset, 'mime' | 'data'>): Uint8Array<ArrayBuffer> {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(asset.data);
  if (!match || match[1] !== asset.mime || match[2].length % 4 !== 0) fail('hibás beágyazott melléklet.');
  if (match[2].length * 0.75 > ARCHIVE_LIMITS.assetBytes + 2) fail('egy melléklet meghaladja a 40 MB méretet.');
  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    return fail('hibás base64 melléklet.');
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (!bytes.length) fail('üres melléklet.');
  if (bytes.length > ARCHIVE_LIMITS.assetBytes) fail('egy melléklet meghaladja a 40 MB méretet.');
  if (asset.mime === 'image/svg+xml') assertSafeSvg(bytes);
  return bytes;
}

export function dataUrl(mime: string, bytes: Uint8Array): string {
  // Avoid spreading large arrays, which exceeds the call stack for photographs.
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  }
  return `data:${mime};base64,${btoa(chunks.join(''))}`;
}

export function readAssets(value: unknown, collectBytes = false) {
  object(value, 'Mellékletek');
  const assetKeys = Object.keys(value);
  if (assetKeys.length >= ARCHIVE_LIMITS.entries) fail('túl sok melléklet.');
  const bytes: Record<string, Uint8Array<ArrayBuffer>> = Object.create(null);
  let totalBytes = 0;
  for (const key of assetKeys) {
    const asset = value[key];
    object(asset, 'Melléklet');
    identifier(asset.id, 'Mellékletazonosító');
    text(asset.name, 'Melléklet neve', 2000);
    text(asset.mime, 'Melléklet típusa', 100);
    text(asset.data, 'Melléklet adata', Math.ceil((ARCHIVE_LIMITS.assetBytes * 4) / 3) + 200);
    if (asset.id !== key || !assetMimes.has(asset.mime))
      fail('hibás mellékletazonosító vagy nem támogatott fájltípus.');
    const content = decodeDataUrl(asset as unknown as Asset);
    if (collectBytes) bytes[key] = content;
    totalBytes += content.length;
    if (totalBytes > ARCHIVE_LIMITS.expandedBytes) fail('a mellékletek együttes mérete túl nagy.');
  }
  return { ids: new Set(assetKeys), bytes };
}

export async function assetFromFile(file: File): Promise<Asset> {
  if (!file.size || file.size > ARCHIVE_LIMITS.assetBytes)
    throw new Error(t('A kép vagy PDF legyen 0 és 40 MB közötti méretű.'));
  const extension = file.name.split('.').pop()?.toLowerCase();
  const fallback: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf'
  };
  const mime = file.type || fallback[extension ?? ''];
  if (!assetMimes.has(mime)) throw new Error(t('PNG, JPG, WebP, GIF, BMP, SVG kép vagy PDF választható.'));
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (mime === 'image/svg+xml') assertSafeSvg(bytes);
  return { id: uid(), name: file.name, mime, data: dataUrl(mime, bytes) };
}
