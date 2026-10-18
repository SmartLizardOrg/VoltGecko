import { GitBranch, History, LayoutGrid, PencilRuler, Zap } from 'lucide-react';
import { t } from '../i18n';

export function getNavigation() {
  return [
    { id: 'floor', label: t('Alaprajz'), icon: PencilRuler },
    { id: 'board', label: t('Elosztó'), icon: LayoutGrid },
    { id: 'single-line', label: t('Egyvonalas'), icon: GitBranch },
    { id: 'circuits', label: t('Áramkörök'), icon: Zap },
    { id: 'history', label: t('Előzmények'), icon: History }
  ] as const;
}

export type View = ReturnType<typeof getNavigation>[number]['id'];
