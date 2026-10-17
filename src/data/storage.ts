import Dexie, { type Table } from 'dexie';
import type { ProjectDocument, ProjectSummary } from '../types';

interface StoredProject { id: string; name: string; site: string; updatedAt: string; document: ProjectDocument }

class ProjectDatabase extends Dexie {
  projects!: Table<StoredProject, string>;
  constructor() {
    super('villamos-tervezo-local');
    this.version(1).stores({ projects: 'id, updatedAt, name' });
  }
}

export const projectDatabase = new ProjectDatabase();

export async function listProjects(): Promise<ProjectSummary[]> {
  const rows = await projectDatabase.projects.orderBy('updatedAt').reverse().toArray();
  return rows.map(({ id, name, site, updatedAt }) => ({ id, name, site, updatedAt }));
}

export async function loadProject(id: string): Promise<ProjectDocument | undefined> {
  return (await projectDatabase.projects.get(id))?.document;
}

export async function saveProject(document: ProjectDocument): Promise<void> {
  await projectDatabase.projects.put({
    id: document.data.id, name: document.data.name, site: document.data.site,
    updatedAt: document.updatedAt, document: structuredClone(document),
  });
}

export async function deleteProject(id: string): Promise<void> {
  await projectDatabase.projects.delete(id);
}
