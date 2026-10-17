import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const notices = [
  'VoltGecko — third-party notices',
  await readFile(join(root, 'LICENSE'), 'utf8'),
  'Generated from the installed production dependencies in package-lock.json.',
  'These components retain their original licenses; the application MIT license does not replace them.',
  'PDF.js resource-specific licenses are also included in /pdfjs/. Noto Sans is licensed in /fonts/OFL.txt.',
];

for (const [relativePath, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!relativePath || entry.dev) continue;
  const directory = join(root, relativePath);
  let files;
  try {
    files = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    // Platform-specific optional packages may be absent on this build machine.
    if (error.code === 'ENOENT' && entry.optional) continue;
    throw error;
  }
  const name = relativePath.split('node_modules/').at(-1);
  notices.push(`\n${'='.repeat(72)}\n${name} ${entry.version}\nLicense: ${entry.license ?? 'See package notices'}\n`);
  const licenseFiles = files
    .filter(file => file.isFile() && (/^(?:licen[sc]e|copying|notice)(?:[._-]|$)/i.test(file.name) || file.name === 'FEEL-FREE.md'))
    .map(file => file.name)
    .sort();
  for (const filename of licenseFiles) {
    notices.push(`--- ${filename} ---\n${await readFile(join(directory, filename), 'utf8')}`);
  }
}

await mkdir(join(root, 'public'), { recursive: true });
await writeFile(join(root, 'public', 'THIRD_PARTY_NOTICES.txt'), `${notices.join('\n')}\n`);
