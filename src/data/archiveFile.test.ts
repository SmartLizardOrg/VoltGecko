import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP, isProjectFilename, stripProjectExtension } from '../config';
import { setLanguage } from '../i18n';
import { decodeProject, encodeProject, saveProjectFile, PROJECT_FILE_FORMAT } from './archive';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { createDemoProject } from './project';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setLanguage('hu');
});

describe('native VoltGecko project archives', () => {
  it('saves a complete .vgecko file through the native picker without changing the working project', async () => {
    const original = createDemoProject();
    original.data.name = 'Lakás.VGECKO';
    const before = structuredClone(original);
    const write = vi.fn<(blob: Blob) => Promise<void>>().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const picker = vi.fn().mockResolvedValue({ createWritable: async () => ({ write, close }) });
    vi.stubGlobal('window', { showSaveFilePicker: picker });

    await saveProjectFile(original);

    expect(picker).toHaveBeenCalledWith({
      suggestedName: 'Lakás.vgecko',
      excludeAcceptAllOption:true,
      types: [{ description: 'VoltGecko projekt', accept: { 'application/zip': ['.vgecko'] } }],
    });
    expect(close).toHaveBeenCalledOnce();
    const reopened = await decodeProject(write.mock.calls[0][0]);
    expect(reopened).toEqual({ ...before, lastExternalSaveAt: expect.any(String) });
    expect(original).toEqual(before);
  });

  it('downloads .vgecko when the native save picker is unavailable', async () => {
    vi.useFakeTimers();
    const original = createDemoProject();
    original.data.name = 'Helyszín.VGECKO';
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:project');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { createElement: () => anchor, body: { append: vi.fn() } });

    await saveProjectFile(original);

    expect(anchor.download).toBe('Helyszín.vgecko');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    const reopened = await decodeProject(createUrl.mock.calls[0][0] as Blob);
    expect(reopened.data).toEqual(original.data);
    expect(reopened.assets).toEqual(original.assets);
    expect(reopened.revisions).toEqual(original.revisions);
    vi.advanceTimersByTime(30_000);
    expect(revokeUrl).toHaveBeenCalledWith('blob:project');
  });

  it.each(['new.vgecko', 'NEW.VGECKO'])(
    'opens %s without changing the archive schema, assets or history', async name => {
      const original = createDemoProject();
      const file = new File([await encodeProject(original)], name, { type: 'application/zip' });
      expect(isProjectFilename(file.name)).toBe(true);
      expect(await decodeProject(file)).toEqual(original);
    },
  );

  it('recognizes only the native suffix and keeps dots inside project names', () => {
    expect(APP.extension).toBe('.vgecko');
    expect(stripProjectExtension(' Version.2.EPLAN ')).toBe('Version.2.EPLAN');
    expect(stripProjectExtension('Version.2')).toBe('Version.2');
    expect(stripProjectExtension('Version.2.VGECKO')).toBe('Version.2');
    expect(isProjectFilename('backup.vgecko.zip')).toBe(false);
    expect(isProjectFilename('backup.eplan.txt')).toBe(false);
  });
  it.each(['old.eplan','project.json','project.zip'])('rejects %s even when renamed from a valid archive',async name=>{
    const file=new File([await encodeProject(createDemoProject())],name,{type:'application/zip'});
    expect(isProjectFilename(name)).toBe(false);await expect(decodeProject(file)).rejects.toThrow('.vgecko');
  });
  it('identifies its native ZIP manifest and rejects raw JSON or an unmarked archive',async()=>{
    const doc=createDemoProject(),blob=await encodeProject(doc),files=unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const manifest=JSON.parse(strFromU8(files['project.json']));expect(manifest.format).toBe(PROJECT_FILE_FORMAT);
    expect(Object.keys(files).filter(name=>name.startsWith('assets/'))).toHaveLength(Object.keys(doc.assets).length);
    await expect(decodeProject(new Blob([JSON.stringify(doc)]))).rejects.toThrow('ZIP');
    delete manifest.format;files['project.json']=strToU8(JSON.stringify(manifest));
    await expect(decodeProject(new Blob([new Uint8Array(zipSync(files)).buffer]))).rejects.toThrow('nem VoltGecko');
  });
});
