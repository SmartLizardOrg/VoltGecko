import { strFromU8, unzipSync } from 'fflate';
import { ARCHIVE_LIMITS, fail } from './format';

const crcTable = Uint32Array.from({ length: 256 }, (_, byte) => {
  let current = byte;
  for (let bit = 0; bit < 8; bit++) current = (current >>> 1) ^ (current & 1 ? 0xedb88320 : 0);
  return current >>> 0;
});
function checksum(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDirectory(bytes: Uint8Array): Map<string, { size: number; crc: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65_557)) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
    end--;
  }
  if (end < 0 || end < bytes.length - 65_557) fail('a ZIP sérült vagy nem támogatott.');
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) fail('többrészes ZIP nem támogatott.');
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryStart = view.getUint32(end + 16, true);
  if (count > ARCHIVE_LIMITS.entries || count !== view.getUint16(end + 8, true)) fail('túl sok ZIP-bejegyzés.');
  if (directoryStart + directorySize !== end) fail('a ZIP könyvtára sérült vagy ZIP64 formátumú.');
  const result = new Map<string, { size: number; crc: number }>();
  let offset = directoryStart;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) fail('sérült ZIP-bejegyzés.');
    const flags = view.getUint16(offset + 8, true);
    const compression = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localStart = view.getUint32(offset + 42, true);
    if (offset + 46 + nameLength + extraLength + commentLength > end) fail('sérült ZIP-fájlnév.');
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (name !== 'project.json' && !/^assets\/\d{5}\.bin$/.test(name))
      fail('ismeretlen vagy nem biztonságos ZIP-fájlnév.');
    if (result.has(name)) fail('ismétlődő ZIP-bejegyzés.');
    if (flags & 1 || (compression !== 0 && compression !== 8)) fail('titkosított vagy nem támogatott ZIP-tömörítés.');
    total += size;
    if (
      size > (name === 'project.json' ? ARCHIVE_LIMITS.jsonBytes : ARCHIVE_LIMITS.assetBytes) ||
      total > ARCHIVE_LIMITS.expandedBytes
    )
      fail('a kicsomagolt projekt túl nagy.');
    if (localStart + 30 > directoryStart || view.getUint32(localStart, true) !== 0x04034b50)
      fail('sérült ZIP-állományfejléc.');
    const localNameLength = view.getUint16(localStart + 26, true);
    const localExtraLength = view.getUint16(localStart + 28, true);
    const payloadStart = localStart + 30 + localNameLength + localExtraLength;
    if (payloadStart + compressedSize > directoryStart || view.getUint16(localStart + 8, true) !== compression)
      fail('sérült ZIP-adatméret.');
    if (strFromU8(bytes.subarray(localStart + 30, localStart + 30 + localNameLength)) !== name)
      fail('eltérő ZIP-fájlnév a fejlécben.');
    result.set(name, { size, crc });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== end) fail('a ZIP könyvtárának mérete hibás.');
  return result;
}

export function readZip(bytes: Uint8Array): Record<string, Uint8Array> {
  const directory = zipDirectory(bytes);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return fail('a ZIP sérült vagy nem támogatott.');
  }
  for (const [name, expected] of directory) {
    if (!files[name] || files[name].length !== expected.size || checksum(files[name]) !== expected.crc)
      fail('a ZIP egyik állománya sérült (méret vagy ellenőrző összeg).');
  }
  return files;
}
