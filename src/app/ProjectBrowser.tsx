import { ChevronRight, FolderOpen, PencilRuler, Plus, X } from 'lucide-react';
import { t } from '../i18n';
import type { ProjectSummary } from '../types';
import { formatDate } from './format';

interface Props {
  projects: ProjectSummary[];
  activeId?: string;
  onCreate: () => void;
  onFiles: () => void;
  onDemo: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ProjectBrowser({ projects, activeId, onCreate, onFiles, onDemo, onOpen, onDelete }: Props) {
  return (
    <>
      <p className="subtle">{t('Ezeket a projekteket ezen az eszközön tárolod.')}</p>
      <div className="modal-button-row">
        <button className="primary" onClick={onCreate}>
          <Plus size={16} />
          {t('Új projekt')}
        </button>
        <button className="quiet" onClick={onFiles}>
          <FolderOpen size={16} />
          {t('Fájl megnyitása')}
        </button>
        <button className="quiet" onClick={onDemo}>
          {t('Új mintaprojekt')}
        </button>
      </div>
      <div className="project-list">
        {projects.map((project) => (
          <article key={project.id}>
            <button onClick={() => onOpen(project.id)}>
              <span className="project-file-icon">
                <PencilRuler size={22} />
              </span>
              <span>
                <strong>{project.name}</strong>
                <small>
                  {project.site || t('Helyi projekt')} · {formatDate(project.updatedAt)}
                </small>
              </span>
              <ChevronRight size={17} />
            </button>
            {project.id !== activeId && (
              <button
                className="icon-button danger-hover"
                aria-label={t('{p0} projekt törlése', { p0: project.name })}
                onClick={() => {
                  if (confirm(t('Végleg törlöd a helyi projektet és annak előzményeit? A külső fájlok megmaradnak.')))
                    onDelete(project.id);
                }}
              >
                <X size={16} />
              </button>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
