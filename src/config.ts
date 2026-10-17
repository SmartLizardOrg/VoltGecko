export const APP = { name: 'VoltGecko', subtitle: 'Tervezz. Szerelj. Add át.', version: '0.1.0', extension: '.vgecko' };

// The archive contents and existing saved projects stay compatible. Only new
// external filenames change; legacy backups must remain selectable.
const projectExtensions = [APP.extension, '.eplan'];
export function isProjectFilename(name: string): boolean {
  return projectExtensions.some(extension => name.toLowerCase().endsWith(extension));
}
export function stripProjectExtension(name: string): string {
  const trimmed = name.trim();
  const extension = projectExtensions.find(extension => trimmed.toLowerCase().endsWith(extension));
  return extension ? trimmed.slice(0, -extension.length) : trimmed;
}
