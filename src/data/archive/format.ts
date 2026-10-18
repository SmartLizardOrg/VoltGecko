import { t } from '../../i18n';

// Limits are checked before ZIP extraction as well as after JSON parsing.
// Files are read in memory on phones, so failures should be explicit and early.
export const ARCHIVE_LIMITS = {
  archiveBytes: 200 * 1024 * 1024,
  expandedBytes: 300 * 1024 * 1024,
  assetBytes: 40 * 1024 * 1024,
  jsonBytes: 30 * 1024 * 1024,
  entries: 2001
} as const;
export const PROJECT_FILE_FORMAT = 'voltgecko-project';

export type JsonObject = Record<string, unknown>;
export function fail(message: string): never {
  throw new Error(t('Érvénytelen projektfájl: {message}', { message: t(message) }));
}
export function object(value: unknown, label: string): asserts value is JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(t('{label} nem objektum.', { label: t(label) }));
}
export function text(value: unknown, label: string, limit = 100_000): asserts value is string {
  if (typeof value !== 'string' || value.length > limit) fail(t('{label} hibás szöveg.', { label: t(label) }));
}
export function identifier(value: unknown, label: string): asserts value is string {
  text(value, label, 200);
  if (!value.trim()) fail(t('{label} üres azonosító.', { label: t(label) }));
}
