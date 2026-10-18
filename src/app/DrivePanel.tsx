import { useEffect, useState } from 'react';
import { ArrowDownToLine, Cloud, Download, FileText, FolderOpen } from 'lucide-react';
import { checkpoint } from '../data/project';
import { saveProject } from '../data/storage';
import { t } from '../i18n';
import {
  connectDrive,
  disconnectDrive,
  isDriveConfigured,
  isDriveConnected,
  listDriveProjects,
  openFromDrive,
  pickDriveProject,
  saveToDrive
} from '../services/drive';
import type { ProjectDocument } from '../types';
import { errorMessage, formatDate, type Perform } from './format';

interface Props {
  document: ProjectDocument | null;
  online: boolean;
  perform: Perform;
  onDocumentChange: (document: ProjectDocument) => void;
  onImport: (document: ProjectDocument) => Promise<void>;
  onExport: () => void;
  onNotify: (message: string) => void;
}

export function DrivePanel({ document, online, perform, onDocumentChange, onImport, onExport, onNotify }: Props) {
  const [connected, setConnected] = useState(isDriveConnected);
  const [files, setFiles] = useState<Awaited<ReturnType<typeof listDriveProjects>>>([]);
  const run: Perform = async (label, operation) => {
    await perform(label, async () => {
      try {
        await operation();
      } finally {
        setConnected(isDriveConnected());
      }
    });
  };

  useEffect(() => {
    if (!connected) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    void listDriveProjects()
      .then((projects) => {
        if (!cancelled) setFiles(projects);
      })
      .catch((error) => {
        if (!cancelled) {
          setConnected(isDriveConnected());
          onNotify(errorMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const save = async () => {
    if (!document) return;
    const next = checkpoint(document, t('Google Drive mentés'));
    onDocumentChange(next);
    await saveToDrive(next);
    const saved = { ...next, lastDriveSaveAt: new Date().toISOString() };
    onDocumentChange(saved);
    await saveProject(saved);
    setFiles(await listDriveProjects());
    onNotify(t('Új projektváltozat került a saját Drive-odra.'));
  };

  return (
    <div className="drive-content">
      <div className="field-note">
        <Cloud size={25} />
        <p>
          <strong>{t('A saját Google Drive-odban.')}</strong>
          <br />
          {t('Minden mentés külön teljes projektváltozat. Megnyitás után a terv internet nélkül is szerkeszthető.')}
        </p>
      </div>
      {!isDriveConfigured() ? (
        <>
          <h3>{t('A Google-kapcsolat még nincs beállítva')}</h3>
          <p>
            {t('A helyi fájlmentés már használható. A fejlesztői Google-kapcsolathoz az')} <code>.env.example</code>{' '}
            {t('alapján állítsd be az OAuth kliensazonosítót, majd indítsd újra az alkalmazást.')}
          </p>
          {document && (
            <button className="primary" onClick={onExport}>
              <Download size={16} />
              {t('Projektfájl mentése')}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="modal-button-row">
            {!connected ? (
              <button
                className="primary"
                disabled={!online}
                onClick={() =>
                  void run(t('Google csatlakoztatása…'), async () => {
                    await connectDrive();
                    setConnected(true);
                  })
                }
              >
                <Cloud size={17} />
                {t('Google Drive csatlakoztatása')}
              </button>
            ) : (
              <>
                {document && (
                  <button
                    className="primary"
                    disabled={!online}
                    onClick={() => void run(t('Google Drive mentés…'), save)}
                  >
                    <Cloud size={17} />
                    {t('Aktuális terv mentése')}
                  </button>
                )}
                <button
                  className="quiet"
                  onClick={() => void run(t('Drive megnyitása…'), async () => onImport(await pickDriveProject()))}
                >
                  <FolderOpen size={16} />
                  {t('Megosztott fájl kiválasztása')}
                </button>
                <button
                  className="quiet"
                  onClick={() => {
                    disconnectDrive();
                    setConnected(false);
                    setFiles([]);
                  }}
                >
                  {t('Leválasztás')}
                </button>
              </>
            )}
          </div>
          {!online && (
            <p className="input-warning">
              {t('A Drive eléréséhez internetkapcsolat szükséges. A helyi terv szerkeszthető.')}
            </p>
          )}
          <div className="drive-file-list">
            {files.map((file) => (
              <button
                key={file.id}
                onClick={() =>
                  void run(t('Drive projekt megnyitása…'), async () => onImport(await openFromDrive(file.id)))
                }
              >
                <FileText size={20} />
                <span>
                  <strong>{file.name}</strong>
                  <small>{formatDate(file.modifiedTime)}</small>
                </span>
                <ArrowDownToLine size={17} />
              </button>
            ))}
            {connected && !files.length && (
              <p className="subtle">{t('Még nincs az alkalmazással mentett projekt a Drive-odon.')}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
