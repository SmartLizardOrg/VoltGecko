import { getLocale, t } from '../i18n';

export const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(getLocale(), {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(value))
    : t('még nincs');

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : t('A művelet nem sikerült.'));

export type Perform = (label: string, operation: () => Promise<void>) => Promise<void>;
