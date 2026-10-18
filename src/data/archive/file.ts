import { APP, stripProjectExtension } from '../../config';
import { t } from '../../i18n';
import { downloadBlob, safeFilename } from '../../services/files';
import type { ProjectDocument } from '../../types';
import { encodeProject } from './codec';

export async function saveProjectFile(document: ProjectDocument): Promise<void> {
  const filename = `${safeFilename(stripProjectExtension(document.data.name))}${APP.extension}`;
  type SaveFilePicker = (options: {
    suggestedName: string;
    excludeAcceptAllOption: boolean;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
  }>;
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  // Open the picker in the user gesture, before asynchronous ZIP generation.
  const handle = picker
    ? await picker.call(window, {
        suggestedName: filename,
        excludeAcceptAllOption: true,
        types: [{ description: t('{app} projekt', { app: APP.name }), accept: { 'application/zip': [APP.extension] } }]
      })
    : undefined;
  // The portable copy records this export, rather than retaining the previous
  // file-save date when it is opened on another device.
  const blob = await encodeProject({ ...document, lastExternalSaveAt: new Date().toISOString() });
  if (handle) {
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      try {
        await writable.abort?.();
      } catch {
        /* preserve the original write error */
      }
      throw error;
    }
  } else downloadBlob(blob, filename);
}
