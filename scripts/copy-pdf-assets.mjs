import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = join(root, 'public', 'pdfjs');
await mkdir(destination, { recursive: true });
// PDF.js loads these by their original names from its worker. Keeping them local
// supports CJK maps, unembedded PDF fonts, and JPEG2000/JBIG2/ICC images offline.
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(join(root, 'node_modules', 'pdfjs-dist', directory), join(destination, directory), { recursive: true, force: true });
}
await cp(join(root, 'node_modules', 'pdfjs-dist', 'LICENSE'), join(destination, 'LICENSE'));
