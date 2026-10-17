import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoProject } from '../data/project';
import { decodeProject, encodeProject } from '../data/archive';

type PickerSelection = { id: string; name: string };

async function connectedDrive(selection?: PickerSelection) {
  vi.resetModules();
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'unit-test-client');
  vi.stubEnv('VITE_GOOGLE_API_KEY', 'unit-test-picker');
  let pickerCallback: (data: unknown) => void = () => {};
  const title = vi.fn();
  class PickerBuilder {
    setDeveloperKey() { return this; }
    setAppId() { return this; }
    setOAuthToken() { return this; }
    addView() { return this; }
    setLocale() { return this; }
    setTitle(value: string) { title(value); return this; }
    setCallback(callback: (data: unknown) => void) { pickerCallback = callback; return this; }
    build() { return { setVisible: () => pickerCallback({ action: 'picked', docs: [selection] }) }; }
  }
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('document', {
    documentElement: { lang: '' }, querySelector: () => null,
    createElement: () => ({ onload: undefined, remove: () => {} }),
    head: { appendChild: (script: { onload?: () => void }) => queueMicrotask(() => script.onload?.()) },
  });
  vi.stubGlobal('window', {
    setTimeout, addEventListener: () => {},
    google: {
      accounts: { oauth2: { initTokenClient: (options: { callback: (token: unknown) => void }) => ({
        requestAccessToken: () => options.callback({ access_token: 'unit-test-token', expires_in: 3600 }),
      }) } },
      picker: { PickerBuilder, DocsView: class { setIncludeFolders() { return this; } }, Action: { PICKED: 'picked', CANCEL: 'cancel' } },
    },
    gapi: { load: (_name: string, options: { callback: () => void }) => options.callback() },
  });
  const drive = await import('./drive');
  await drive.connectDrive();
  return { drive, title };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Drive project extension compatibility', () => {
  it('lists legacy and new projects using the same stable app marker', async () => {
    const { drive } = await connectedDrive();
    const files = [
      { id: 'old', name: 'Legacy.eplan', modifiedTime: '2026-01-01T00:00:00Z' },
      { id: 'new', name: 'Latest.vgecko', modifiedTime: '2026-01-02T00:00:00Z' },
    ];
    const fetch = vi.fn().mockResolvedValue(Response.json({ files }));
    vi.stubGlobal('fetch', fetch);

    expect(await drive.listDriveProjects()).toEqual(files);
    const query = new URL(fetch.mock.calls[0][0]).searchParams.get('q');
    expect(query).toContain("value='electric-planner-local-v1'");
    expect(query).not.toMatch(/eplan|vgecko/);
  });

  it('uploads a new .vgecko snapshot while preserving stable metadata and archive contents', async () => {
    const { drive } = await connectedDrive();
    const original = createDemoProject();
    original.data.name = 'Version.2.EPLAN';
    const before = structuredClone(original);
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ files: [{ id: 'folder' }] }))
      .mockResolvedValueOnce(new Response('', { headers: { Location: 'https://www.googleapis.com/upload/unit-test' } }))
      .mockResolvedValueOnce(new Response(''));
    vi.stubGlobal('fetch', fetch);

    await drive.saveToDrive(original);

    const metadata = JSON.parse(fetch.mock.calls[1][1].body);
    expect(metadata.name).toMatch(/^Version\.2 · .+\.vgecko$/);
    expect(metadata.appProperties.plannerApp).toBe('electric-planner-local-v1');
    expect(metadata.appProperties.projectId).toBe(original.data.id);
    const snapshot = await decodeProject(fetch.mock.calls[2][1].body);
    expect(snapshot).toEqual({ ...before, lastDriveSaveAt: expect.any(String) });
    expect(original).toEqual(before);
  });

  it.each(['shared.VGECKO', 'shared.EPLAN'])('opens %s from Google Picker', async name => {
    const { drive, title } = await connectedDrive({ id: 'selected-file', name });
    const original = createDemoProject();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(await encodeProject(original))));

    expect(await drive.pickDriveProject()).toEqual(original);
    expect(title).toHaveBeenCalledWith('VoltGecko · .vgecko projekt kiválasztása');
  });
});
