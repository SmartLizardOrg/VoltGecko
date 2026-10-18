export const APP = { name: 'VoltGecko', subtitle: 'Tervezz. Szerelj. Add át.', version: '0.1.0', extension: '.vgecko' };

export function isProjectFilename(name: string): boolean {
  return name.toLowerCase().endsWith(APP.extension);
}
export function stripProjectExtension(name: string): string {
  const trimmed = name.trim();
  return isProjectFilename(trimmed) ? trimmed.slice(0, -APP.extension.length) : trimmed;
}
